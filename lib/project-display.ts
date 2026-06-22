// 專案列表/狀態的共用顯示工具（前端用）。

export type ProjectListItem = {
  id: string;
  title: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  status: string;
  progress: number;
  steps?: Record<string, { status?: string; progress?: number; message?: string }>;
  updatedAt: string;
};

export const PROJECT_BUSY_STATUSES = ["QUEUED", "ANALYZING", "STRUCTURING", "ADAPTING", "STORYBOARDING", "GENERATING", "MERGING"];

export const PROJECT_STEP_LABELS: Array<[string, string]> = [
  ["source", "影片下載"],
  ["transcribe", "轉錄音訊"],
  ["frames", "抽取影格"],
  ["analyze", "影片分析"],
  ["adapt", "改編腳本"],
  ["storyboard", "產生分鏡"],
  ["mergeStoryboard", "合併分鏡"],
  ["video", "生成影片"]
];

export function projectDisplayTitle(project: Pick<ProjectListItem, "title">) {
  const title = project.title?.trim();
  if (!title || title === "AI 分析中") return "未命名專案";
  const legacyGeneratedTitlePrefixes = ["服務業反轉爽劇", "孩子偏心爸爸的花", "髮型與整體造型是"];
  if (legacyGeneratedTitlePrefixes.some((prefix) => title.startsWith(prefix))) return "未命名專案";
  return title;
}

export function runningProjectLabel(project: Pick<ProjectListItem, "status" | "steps">) {
  const runningStep = PROJECT_STEP_LABELS.find(([key]) => project.steps?.[key]?.status === "running");
  if (runningStep) return runningStep[1];

  switch (project.status) {
    case "QUEUED":
      return "排隊中";
    case "ANALYZING":
      return "影片分析";
    case "STRUCTURING":
    case "ADAPTING":
      return "改編腳本";
    case "STORYBOARDING":
      return "產生分鏡";
    case "GENERATING":
    case "MERGING":
      return "生成影片";
    default:
      return "";
  }
}

export function projectStatusLabel(status: string) {
  switch (status) {
    case "DRAFT":
      return "草稿";
    case "QUEUED":
      return "排隊中";
    case "ANALYZING":
      return "分析中";
    case "ANALYSIS_READY":
      return "分析完成";
    case "STRUCTURING":
      return "拆解結構中";
    case "STRUCTURE_READY":
      return "結構完成";
    case "ADAPTING":
      return "改編中";
    case "ADAPT_READY":
      return "腳本完成";
    case "STORYBOARDING":
      return "產生分鏡中";
    case "STORYBOARD_READY":
      return "分鏡完成";
    case "GENERATING":
      return "生成中";
    case "MERGING":
      return "合成中";
    case "COMPLETED":
      return "已完成";
    case "FAILED":
      return "失敗";
    default:
      return "處理中";
  }
}
