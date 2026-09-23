CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor VARCHAR(80) NOT NULL,
  action VARCHAR(120) NOT NULL,
  target VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  record_no VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(80) NOT NULL,
  gender VARCHAR(16) NOT NULL,
  age INT NOT NULL,
  id_card VARCHAR(32) UNIQUE NOT NULL,
  phone VARCHAR(32) NOT NULL,
  allergies TEXT,
  history TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medical_records (
  id SERIAL PRIMARY KEY,
  patient_id INT REFERENCES patients(id),
  department VARCHAR(80) NOT NULL,
  doctor VARCHAR(80) NOT NULL,
  record_type VARCHAR(20) NOT NULL,
  chief_complaint TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  treatment TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id SERIAL PRIMARY KEY,
  record_id INT REFERENCES medical_records(id),
  drug_name VARCHAR(120) NOT NULL,
  specification VARCHAR(80) NOT NULL,
  dosage VARCHAR(80) NOT NULL,
  frequency VARCHAR(80) NOT NULL,
  duration VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT '待审核',
  created_by VARCHAR(80) NOT NULL DEFAULT 'system',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(80) NOT NULL DEFAULT 'system',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 兼容旧版本初始化过的数据库：补齐操作人与时间列
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS created_by VARCHAR(80) NOT NULL DEFAULT 'system';
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS updated_by VARCHAR(80) NOT NULL DEFAULT 'system';
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS prescription_status_logs (
  id SERIAL PRIMARY KEY,
  prescription_id INT REFERENCES prescriptions(id),
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  operator VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO patients (record_no, name, gender, age, id_card, phone, allergies, history)
VALUES
  ('EMR202606001', '张若宁', '女', 34, '110101199201010028', '13800010001', '青霉素', '慢性鼻炎'),
  ('EMR202606002', '李明哲', '男', 48, '110101197801010019', '13800010002', '无', '高血压')
ON CONFLICT (record_no) DO NOTHING;

INSERT INTO medical_records (patient_id, department, doctor, record_type, chief_complaint, diagnosis, treatment, status)
SELECT id, '全科门诊', '王主任', '门诊', '发热伴咽痛 2 天', '急性上呼吸道感染', '对症治疗，复诊随访', '待审签'
FROM patients WHERE record_no = 'EMR202606001'
ON CONFLICT DO NOTHING;

INSERT INTO prescriptions (record_id, drug_name, specification, dosage, frequency, duration, status, created_by, updated_by)
SELECT r.id, '布洛芬缓释胶囊', '0.3g*20粒', '0.3g', 'bid', '3天', '待审核', '王主任', '王主任'
FROM medical_records r
JOIN patients p ON p.id = r.patient_id
WHERE p.record_no = 'EMR202606001' AND r.chief_complaint = '发热伴咽痛 2 天'
ON CONFLICT DO NOTHING;

INSERT INTO prescriptions (record_id, drug_name, specification, dosage, frequency, duration, status, created_by, updated_by)
SELECT r.id, '连花清瘟颗粒', '6g*10袋', '6g', 'tid', '3天', '已审核', '王主任', '李药师'
FROM medical_records r
JOIN patients p ON p.id = r.patient_id
WHERE p.record_no = 'EMR202606001' AND r.chief_complaint = '发热伴咽痛 2 天'
ON CONFLICT DO NOTHING;

INSERT INTO prescription_status_logs (prescription_id, from_status, to_status, operator)
SELECT id, NULL, '待审核', '王主任' FROM prescriptions WHERE drug_name = '布洛芬缓释胶囊'
ON CONFLICT DO NOTHING;

INSERT INTO prescription_status_logs (prescription_id, from_status, to_status, operator)
SELECT id, NULL, '待审核', '王主任' FROM prescriptions WHERE drug_name = '连花清瘟颗粒'
ON CONFLICT DO NOTHING;

INSERT INTO prescription_status_logs (prescription_id, from_status, to_status, operator)
SELECT id, '待审核', '已审核', '李药师' FROM prescriptions WHERE drug_name = '连花清瘟颗粒'
ON CONFLICT DO NOTHING;
