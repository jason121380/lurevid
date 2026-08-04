// 使用者可編輯文字欄位的長度上限，避免超大 payload 造成 DB / OpenAI 成本與 DoS。
export const MAX_ANALYSIS_LENGTH = 100_000;
export const MAX_STRUCTURE_LENGTH = 100_000;
export const MAX_SCRIPT_LENGTH = 100_000;

// 「快速使用」的提示詞上限。比腳本短很多，圖片/影片模型本來就吃不了太長的描述。
export const MAX_PROMPT_LENGTH = 4_000;
