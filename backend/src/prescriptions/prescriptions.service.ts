import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { APP_MESSAGES, PRESCRIPTION_FLOW, PRESCRIPTION_STATUS } from '../common/constants';
import { DatabaseService } from '../common/database.service';

export interface CreatePrescriptionDto {
  drugName: string;
  specification: string;
  dosage: string;
  frequency: string;
  duration: string;
  operator?: string;
}

export interface UpdatePrescriptionStatusDto {
  status: string;
  operator?: string;
}

const PRESCRIPTION_SELECT = `
  SELECT id, record_id AS "recordId", drug_name AS "drugName", specification,
         dosage, frequency, duration, status,
         created_by AS "createdBy", created_at AS "createdAt",
         updated_by AS "updatedBy", updated_at AS "updatedAt"
  FROM prescriptions`;

@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listByRecord(recordId: number) {
    const record = await this.database.query('SELECT id FROM medical_records WHERE id = $1', [recordId]);
    if (!record.rowCount) {
      throw new NotFoundException(APP_MESSAGES.recordNotFound);
    }
    const prescriptions = await this.database.query(
      `${PRESCRIPTION_SELECT} WHERE record_id = $1 ORDER BY id DESC`,
      [recordId],
    );
    const logs = await this.database.query(
      `SELECT l.id, l.prescription_id AS "prescriptionId", l.from_status AS "fromStatus",
              l.to_status AS "toStatus", l.operator, l.created_at AS "createdAt"
       FROM prescription_status_logs l
       JOIN prescriptions p ON p.id = l.prescription_id
       WHERE p.record_id = $1
       ORDER BY l.id`,
      [recordId],
    );
    const logsByPrescription = new Map<number, unknown[]>();
    for (const log of logs.rows) {
      const list = logsByPrescription.get(log.prescriptionId) ?? [];
      list.push(log);
      logsByPrescription.set(log.prescriptionId, list);
    }
    return prescriptions.rows.map((row) => ({ ...row, logs: logsByPrescription.get(row.id) ?? [] }));
  }

  async create(recordId: number, dto: CreatePrescriptionDto) {
    const record = await this.database.query(
      `SELECT r.id, p.allergies
       FROM medical_records r
       JOIN patients p ON p.id = r.patient_id
       WHERE r.id = $1`,
      [recordId],
    );
    if (!record.rowCount) {
      throw new NotFoundException(APP_MESSAGES.recordNotFound);
    }

    const drugName = dto.drugName?.trim();
    const specification = dto.specification?.trim();
    const dosage = dto.dosage?.trim();
    const frequency = dto.frequency?.trim();
    const duration = dto.duration?.trim();
    if (!drugName || !specification || !dosage || !frequency || !duration) {
      throw new BadRequestException(APP_MESSAGES.prescriptionFieldsRequired);
    }

    const allergyHit = this.matchAllergy(record.rows[0].allergies, drugName);
    if (allergyHit) {
      throw new BadRequestException(`患者过敏史包含「${allergyHit}」，禁止开具药品「${drugName}」`);
    }

    // 同一病历中相同药品在待审核/已审核阶段只保留一条，重复提交直接返回已有处方
    const existing = await this.database.query(
      `${PRESCRIPTION_SELECT}
       WHERE record_id = $1 AND drug_name = $2 AND status IN ($3, $4)
       ORDER BY id DESC LIMIT 1`,
      [recordId, drugName, PRESCRIPTION_STATUS.pending, PRESCRIPTION_STATUS.approved],
    );
    if (existing.rowCount) {
      return { ...existing.rows[0], duplicated: true };
    }

    const operator = dto.operator?.trim() || 'system';
    const inserted = await this.database.query(
      `INSERT INTO prescriptions (record_id, drug_name, specification, dosage, frequency, duration, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING id`,
      [recordId, drugName, specification, dosage, frequency, duration, PRESCRIPTION_STATUS.pending, operator],
    );
    const id = inserted.rows[0].id as number;
    await this.logStatus(id, null, PRESCRIPTION_STATUS.pending, operator);
    await this.audit.log(operator, '开具处方', `prescription:${id}`);

    const created = await this.database.query(`${PRESCRIPTION_SELECT} WHERE id = $1`, [id]);
    return { ...created.rows[0], duplicated: false };
  }

  async updateStatus(id: number, dto: UpdatePrescriptionStatusDto) {
    const current = await this.database.query(`${PRESCRIPTION_SELECT} WHERE id = $1`, [id]);
    if (!current.rowCount) {
      throw new NotFoundException(APP_MESSAGES.prescriptionNotFound);
    }

    const from = current.rows[0].status as string;
    const to = dto.status?.trim();
    const fromIndex = PRESCRIPTION_FLOW.indexOf(from as (typeof PRESCRIPTION_FLOW)[number]);
    const toIndex = PRESCRIPTION_FLOW.indexOf(to as (typeof PRESCRIPTION_FLOW)[number]);
    if (toIndex === -1 || toIndex !== fromIndex + 1) {
      throw new BadRequestException(
        `处方状态须按「${PRESCRIPTION_FLOW.join('→')}」依次流转，不能由「${from}」变更为「${to || '空'}」`,
      );
    }

    const operator = dto.operator?.trim() || 'system';
    await this.database.query(
      `UPDATE prescriptions
       SET status = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [to, operator, id],
    );
    await this.logStatus(id, from, to, operator);
    await this.audit.log(operator, `处方状态变更为${to}`, `prescription:${id}`);

    const updated = await this.database.query(`${PRESCRIPTION_SELECT} WHERE id = $1`, [id]);
    return updated.rows[0];
  }

  private async logStatus(prescriptionId: number, from: string | null, to: string, operator: string) {
    await this.database.query(
      'INSERT INTO prescription_status_logs (prescription_id, from_status, to_status, operator) VALUES ($1, $2, $3, $4)',
      [prescriptionId, from, to, operator],
    );
  }

  private matchAllergy(allergies: string | null, drugName: string): string | null {
    if (!allergies) {
      return null;
    }
    const terms = allergies
      .split(/[,，、;；\s]+/)
      .map((term) => term.trim())
      .filter((term) => term && term !== '无');
    return terms.find((term) => drugName.includes(term) || term.includes(drugName)) ?? null;
  }
}
