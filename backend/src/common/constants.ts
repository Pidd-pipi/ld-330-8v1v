export const APP_MESSAGES = {
  unauthorized: '当前用户未登录或令牌无效',
  forbidden: '当前角色无权执行该操作',
  patientNotFound: '未找到患者档案',
  recordNotFound: '未找到病历',
  recordArchived: '已归档病历需申请修改并留痕',
  prescriptionNotFound: '未找到处方',
  allergyConflict: '患者过敏史命中该药品，禁止开具',
  invalidStatusTransition: '处方状态只能按 待审核 → 已审核 → 已执行 依次流转',
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

export const PRESCRIPTION_STATUS = ['待审核', '已审核', '已执行'];

export const PRESCRIPTION_FLOW: Record<string, string> = {
  待审核: '已审核',
  已审核: '已执行',
};

// 过敏史中表示"无过敏"的常见写法，不参与药品匹配
export const NO_ALLERGY_WORDS = ['无', '无过敏史', '无药物过敏', '无药物过敏史', '否认药物过敏', '否认过敏史', 'none', 'no'];
