export const APP_MESSAGES = {
  unauthorized: '当前用户未登录或令牌无效',
  forbidden: '当前角色无权执行该操作',
  patientNotFound: '未找到患者档案',
  recordNotFound: '未找到病历',
  prescriptionNotFound: '未找到处方',
  recordArchived: '已归档病历需申请修改并留痕',
  prescriptionFieldsRequired: '请完整填写药品名称、规格、用量、频次和疗程',
};

export const ROLES = {
  doctor: 'doctor',
  nurse: 'nurse',
  admin: 'admin',
} as const;

export const RECORD_STATUS = {
  draft: '草稿',
  pendingReview: '待审签',
  archived: '已归档',
};

export const PRESCRIPTION_STATUS = {
  pending: '待审核',
  approved: '已审核',
  executed: '已执行',
} as const;

// 处方状态只能沿该顺序逐级流转，越级或回退均视为非法操作
export const PRESCRIPTION_FLOW = [
  PRESCRIPTION_STATUS.pending,
  PRESCRIPTION_STATUS.approved,
  PRESCRIPTION_STATUS.executed,
] as const;
