// 使用者可編輯文字欄位的長度上限，避免超大 payload 造成 DB / OpenAI 成本與 DoS。
export const MAX_ANALYSIS_LENGTH = 100_000;
export const MAX_STRUCTURE_LENGTH = 100_000;
export const MAX_SCRIPT_LENGTH = 100_000;
