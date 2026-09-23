import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { APP_MESSAGES, NO_ALLERGY_WORDS, PRESCRIPTION_FLOW, RECORD_STATUS } from '../common/constants';
import { DatabaseService } from '../common/database.service';

export interface CreatePatientDto {
  name: string;
  gender: string;
  age: number;
  idCard: string;
  phone: string;
  allergies?: string;
  history?: string;
}

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
         dosage, frequency, duration, status, created_by AS "createdBy",
         created_at AS "createdAt", updated_at AS "updatedAt"
  FROM prescriptions`;

@Injectable()
export class RecordsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async summary() {
    const [patients, records, prescriptions, workload] = await Promise.all([
      this.database.query<{ count: string }>('SELECT COUNT(*) FROM patients'),
      this.database.query<{ count: string }>('SELECT COUNT(*) FROM medical_records'),
      this.database.query<{ count: string }>('SELECT COUNT(*) FROM prescriptions'),
      this.database.query<{ department: string; count: string }>(
        'SELECT department, COUNT(*) FROM medical_records GROUP BY department ORDER BY COUNT(*) DESC',
      ),
    ]);
    return {
      patientCount: Number(patients.rows[0].count),
      recordCount: Number(records.rows[0].count),
      prescriptionCount: Number(prescriptions.rows[0].count),
      workload: workload.rows.map((item) => ({ department: item.department, count: Number(item.count) })),
    };
  }

  async searchPatients(keyword = '') {
    const like = `%${keyword}%`;
    const result = await this.database.query<{ id: number; status: string }>(
      `SELECT id, record_no AS "recordNo", name, gender, age, id_card AS "idCard", phone, allergies, history, created_at AS "createdAt"
       FROM patients
       WHERE name ILIKE $1 OR id_card ILIKE $1 OR phone ILIKE $1
       ORDER BY created_at DESC`,
      [like],
    );
    return result.rows;
  }

  async createPatient(dto: CreatePatientDto) {
    const recordNo = `EMR${Date.now().toString().slice(-9)}`;
    const result = await this.database.query(
      `INSERT INTO patients (record_no, name, gender, age, id_card, phone, allergies, history)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, record_no AS "recordNo", name, gender, age, id_card AS "idCard", phone, allergies, history`,
      [recordNo, dto.name, dto.gender, dto.age, dto.idCard, dto.phone, dto.allergies ?? '', dto.history ?? ''],
    );
    await this.audit.log('doctor', '创建患者档案', recordNo);
    return result.rows[0];
  }

  async timeline(patientId: number) {
    const patient = await this.database.query('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (!patient.rowCount) {
      throw new NotFoundException(APP_MESSAGES.patientNotFound);
    }
    const records = await this.database.query(
      `SELECT id, department, doctor, record_type AS "recordType", chief_complaint AS "chiefComplaint",
              diagnosis, treatment, status, created_at AS "createdAt"
       FROM medical_records WHERE patient_id = $1 ORDER BY created_at DESC`,
      [patientId],
    );
    return records.rows;
  }

  async createRecord(patientId: number) {
    const result = await this.database.query(
      `INSERT INTO medical_records
       (patient_id, department, doctor, record_type, chief_complaint, diagnosis, treatment, status)
       VALUES ($1, '心内科', '赵医生', '门诊', '胸闷待查', '冠心病风险评估', '完善心电图与血脂检查', $2)
       RETURNING id, status`,
      [patientId, RECORD_STATUS.pendingReview],
    );
    await this.audit.log('doctor', '创建结构化病历', `record:${result.rows[0].id}`);
    return result.rows[0];
  }

  async listPrescriptions(recordId: number) {
    await this.ensureRecord(recordId);
    const prescriptions = await this.database.query<{ id: number }>(
      `${PRESCRIPTION_SELECT} WHERE record_id = $1 ORDER BY created_at DESC, id DESC`,
      [recordId],
    );
    const logs = await this.database.query(
      `SELECT id, prescription_id AS "prescriptionId", from_status AS "fromStatus",
              to_status AS "toStatus", operator, created_at AS "createdAt"
       FROM prescription_status_logs
       WHERE prescription_id IN (SELECT id FROM prescriptions WHERE record_id = $1)
       ORDER BY created_at ASC, id ASC`,
      [recordId],
    );
    return prescriptions.rows.map((row) => ({
      ...row,
      logs: logs.rows.filter((log) => log.prescriptionId === row.id),
    }));
  }

  async createPrescription(recordId: number, dto: CreatePrescriptionDto) {
    const record = await this.ensureRecord(recordId);
    const required: Array<keyof CreatePrescriptionDto> = ['drugName', 'specification', 'dosage', 'frequency', 'duration'];
    if (required.some((field) => !dto[field] || !String(dto[field]).trim())) {
      throw new BadRequestException('药品名称、规格、用量、频次、疗程均为必填项');
    }
    const drugName = dto.drugName.trim();
    const operator = dto.operator?.trim() || '未登记';

    const allergyHit = this.findAllergyHit(record.allergies, drugName);
    if (allergyHit) {
      await this.audit.log(operator, '开方被过敏史拦截', `record:${recordId} drug:${drugName}`);
      throw new BadRequestException(`${APP_MESSAGES.allergyConflict}（过敏项：${allergyHit}）`);
    }

    // 同一病历、相同药品在待审核/已审核阶段只保留一条，重复提交直接返回已有处方
    const existing = await this.database.query<{ id: number }>(
      `${PRESCRIPTION_SELECT} WHERE record_id = $1 AND drug_name = $2 AND status IN ('待审核', '已审核')
       ORDER BY id DESC LIMIT 1`,
      [recordId, drugName],
    );
    if (existing.rowCount) {
      return { ...existing.rows[0], duplicated: true };
    }

    const inserted = await this.database.query<{ id: number }>(
      `INSERT INTO prescriptions (record_id, drug_name, specification, dosage, frequency, duration, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, '待审核', $7)
       RETURNING id`,
      [recordId, drugName, dto.specification.trim(), dto.dosage.trim(), dto.frequency.trim(), dto.duration.trim(), operator],
    );
    const prescriptionId = inserted.rows[0].id;
    await this.logStatusChange(prescriptionId, null, '待审核', operator);
    await this.audit.log(operator, '开具处方', `record:${recordId} prescription:${prescriptionId}`);

    const created = await this.database.query(`${PRESCRIPTION_SELECT} WHERE id = $1`, [prescriptionId]);
    return { ...created.rows[0], duplicated: false };
  }

  async updatePrescriptionStatus(prescriptionId: number, dto: UpdatePrescriptionStatusDto) {
    const current = await this.database.query<{ id: number; status: string }>(
      'SELECT id, status FROM prescriptions WHERE id = $1',
      [prescriptionId],
    );
    if (!current.rowCount) {
      throw new NotFoundException(APP_MESSAGES.prescriptionNotFound);
    }
    const fromStatus = current.rows[0].status;
    const targetStatus = dto.status;
    // 只允许 待审核 → 已审核 → 已执行 逐级流转，越级或回退均失败
    if (PRESCRIPTION_FLOW[fromStatus] !== targetStatus) {
      throw new BadRequestException(
        `${APP_MESSAGES.invalidStatusTransition}，当前为「${fromStatus}」，不能变更为「${targetStatus ?? ''}」`,
      );
    }
    const operator = dto.operator?.trim() || '未登记';
    await this.database.query(
      'UPDATE prescriptions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [targetStatus, prescriptionId],
    );
    await this.logStatusChange(prescriptionId, fromStatus, targetStatus, operator);
    await this.audit.log(operator, `处方状态变更 ${fromStatus} → ${targetStatus}`, `prescription:${prescriptionId}`);

    const updated = await this.database.query(`${PRESCRIPTION_SELECT} WHERE id = $1`, [prescriptionId]);
    return updated.rows[0];
  }

  private async ensureRecord(recordId: number) {
    const result = await this.database.query<{ id: number; allergies: string }>(
      `SELECT r.id, COALESCE(p.allergies, '') AS allergies
       FROM medical_records r JOIN patients p ON p.id = r.patient_id
       WHERE r.id = $1`,
      [recordId],
    );
    if (!result.rowCount) {
      throw new NotFoundException(APP_MESSAGES.recordNotFound);
    }
    return result.rows[0];
  }

  private findAllergyHit(allergies: string, drugName: string): string | null {
    const terms = (allergies ?? '')
      .split(/[,，、;；/\s]+/)
      .map((term) => term.trim())
      .filter((term) => term && !NO_ALLERGY_WORDS.includes(term.toLowerCase()));
    for (const term of terms) {
      const core = term.replace(/(药物)?过敏(史)?$/, '').replace(/不耐受$/, '') || term;
      if (drugName.includes(core) || core.includes(drugName) || drugName.includes(term) || term.includes(drugName)) {
        return term;
      }
    }
    return null;
  }

  private async logStatusChange(prescriptionId: number, fromStatus: string | null, toStatus: string, operator: string) {
    await this.database.query(
      'INSERT INTO prescription_status_logs (prescription_id, from_status, to_status, operator) VALUES ($1, $2, $3, $4)',
      [prescriptionId, fromStatus, toStatus, operator],
    );
  }
}
