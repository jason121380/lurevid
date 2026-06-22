export type Scene = {
  id: string;
  sceneNumber: number;
  title: string;
  visualGoal: string;
  imagePrompt?: string;
  imageUrl?: string;
  seedancePrompt: string;
  status: string;
  videoUrl?: string;
  error?: string;
};

export type Project = {
  id: string;
  title?: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  sourceVideoUrl?: string;
  sourceFrameUrls?: string[];
  sourceTranscript?: string;
  visualAnalysis?: string;
  analysis?: string;
  structure?: string;
  adaptedScript?: string;
  status: string;
  message: string;
  progress: number;
  ratio?: string;
  resolution?: string;
  duration?: number;
  storyboardImageUrl?: string;
  finalVideoUrl?: string;
  error?: string;
  steps?: Record<string, { status?: string; progress?: number; message?: string }>;
  scenes: Scene[];
};

export type StepState = "done" | "active" | "waiting" | "failed";
export type StepInfo = { title: string; description: string; state: StepState; progress: number; errorMessage?: string };

export function hasNineStoryboardImages(project: Project) {
  return project.scenes.length === 9 && project.scenes.every((scene) => scene.imageUrl);
}

export function buildProcessSteps(project: Project): StepInfo[] {
  const steps = (project.steps || {}) as Record<string, { status?: string; progress?: number; message?: string }>;
  const storyboardDone = hasNineStoryboardImages(project);
  const mergeDone = Boolean(project.storyboardImageUrl);

  const sub = (key: string, done: boolean): StepState => {
    const s = steps[key]?.status;
    if (s === "running") return "active";
    if (s === "failed") return "failed";
    if (done) return "done";
    return "waiting";
  };
  const subProgress = (key: string, state: StepState): number => {
    if (state === "done") return 1;
    if (state === "active") return steps[key]?.progress ?? 0.3;
    return 0;
  };
  const phase = (done: boolean, active: boolean): StepState =>
    project.status === "FAILED" && active ? "failed" : done ? "done" : active ? "active" : "waiting";
  const generatedPhase = (key: string, done: boolean, active: boolean): StepState => {
    const s = steps[key]?.status;
    if (s === "running") return "active";
    if (s === "failed") return "failed";
    if (done || s === "done") return "done";
    return phase(done, active);
  };

  const mk = (key: string, title: string, description: string, state: StepState, progress?: number): StepInfo => ({
    title,
    description,
    state,
    progress: progress ?? (state === "done" ? 1 : state === "active" ? 0.5 : 0),
    errorMessage: steps[key]?.status === "failed" && typeof steps[key]?.message === "string" ? steps[key]?.message : undefined
  });

  const s1 = sub("source", Boolean(project.sourceVideoUrl));
  const s2 = sub("transcribe", Boolean(project.sourceTranscript));
  const s3 = sub("frames", Boolean(project.sourceFrameUrls?.length));
  const s4 = sub("analyze", Boolean(project.analysis));

  return [
    mk("source", "影片下載", "下載來源 MP4", s1, subProgress("source", s1)),
    mk("transcribe", "轉錄音訊", "把影片聲音轉成逐字稿", s2, subProgress("transcribe", s2)),
    mk("frames", "抽取影格", "用 ffmpeg 抽出代表性畫面", s3, subProgress("frames", s3)),
    mk("analyze", "影片分析", "依據逐字稿與影格產出洞察", s4, subProgress("analyze", s4)),
    mk("adapt", "改編腳本", "內部拆解結構並改寫成新腳本", generatedPhase("adapt", Boolean(project.adaptedScript), ["STRUCTURING", "ADAPTING"].includes(project.status)), steps.adapt?.progress),
    mk("storyboard", "產生分鏡", "確認腳本後產生 9 張分鏡圖", generatedPhase("storyboard", storyboardDone, project.status === "STORYBOARDING" && !storyboardDone), steps.storyboard?.progress),
    mk("mergeStoryboard", "合併分鏡", "把 9 張分鏡圖合成單張分鏡圖", generatedPhase("mergeStoryboard", mergeDone, project.status === "STORYBOARDING" && storyboardDone), steps.mergeStoryboard?.progress),
    mk("video", "生成影片", "把單張分鏡圖送給 Seedance 生成影片", generatedPhase("video", project.status === "COMPLETED" || Boolean(project.finalVideoUrl), ["QUEUED", "GENERATING", "MERGING"].includes(project.status)), steps.video?.progress)
  ];
}

export function stepCanRun(project: Project, stepNumber: number) {
  if (stepNumber === 1) return Boolean(project.sourceUrl);
  if (stepNumber === 2) return Boolean(project.sourceUrl);
  if (stepNumber === 3) return Boolean(project.sourceUrl);
  if (stepNumber === 4) return Boolean(project.sourceTranscript && project.sourceFrameUrls?.length);
  if (stepNumber === 5) return Boolean(project.analysis);
  if (stepNumber === 6) return Boolean(project.adaptedScript);
  if (stepNumber === 7) return hasNineStoryboardImages(project);
  if (stepNumber === 8) return Boolean(project.storyboardImageUrl);
  return false;
}

export function stepBlockedReason(project: Project, stepNumber: number, busy = false) {
  if (busy) return "目前有任務執行中";
  if (stepNumber >= 1 && stepNumber <= 3 && !project.sourceUrl) return "缺少來源連結";
  if (stepNumber === 4) {
    if (!project.sourceTranscript && !project.sourceFrameUrls?.length) return "請先完成轉錄音訊與抽取影格";
    if (!project.sourceTranscript) return "請先完成轉錄音訊";
    if (!project.sourceFrameUrls?.length) return "請先完成抽取影格";
  }
  if (stepNumber === 5 && !project.analysis) return "請先完成影片分析";
  if (stepNumber === 6 && !project.adaptedScript) return "請先完成改編腳本";
  if (stepNumber === 7 && !hasNineStoryboardImages(project)) return "請先產生 9 張分鏡圖";
  if (stepNumber === 8 && !project.storyboardImageUrl) return "請先完成合併分鏡";
  return "";
}

export function stepActionLabel(project: Project, stepNumber: number) {
  const step = buildProcessSteps(project)[stepNumber - 1];
  if (!step) return "執行";
  if (step.state === "done" || step.state === "failed") return "重新執行";
  if (step.state === "active") return "執行中";
  return "開始執行";
}

export function activeStepError(project: Project, stepNumber: number) {
  const stepError = buildProcessSteps(project)[stepNumber - 1]?.errorMessage || "";
  if (stepError) return stepError;
  if (project.status !== "FAILED" || !project.error) return "";

  if (stepNumber === failedProjectStep(project)) return project.error;
  return "";
}

function failedProjectStep(project: Project) {
  if (project.error?.toLowerCase().includes("seedance")) return 8;
  if (project.storyboardImageUrl && !project.finalVideoUrl) return 8;
  if (hasNineStoryboardImages(project) && !project.storyboardImageUrl) return 7;
  if (project.scenes.length > 0 && !hasNineStoryboardImages(project)) return 6;
  if (project.adaptedScript) return 6;
  if (project.analysis) return 5;
  if (project.sourceTranscript && project.sourceFrameUrls?.length) return 4;
  if (project.sourceFrameUrls?.length) return 3;
  if (project.sourceTranscript) return 2;
  return 1;
}
