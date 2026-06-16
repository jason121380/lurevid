"use client";

import { Check, ChevronDown, Clapperboard, Download, FileText, Film, ImageIcon, Layers3, Link2, Loader2, Pencil, Play, RotateCcw, Save, Sparkles, Video, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";

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

const BUSY = ["QUEUED", "ANALYZING", "STRUCTURING", "ADAPTING", "STORYBOARDING", "GENERATING", "MERGING"];
const FIXED_VIDEO_RATIO = "9:16";
const FIXED_VIDEO_RESOLUTION = "720p";
type StepState = "done" | "active" | "waiting" | "failed";
type ActivePanel = "project" | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

type StepInfo = { title: string; description: string; state: StepState; progress: number; errorMessage?: string };
type StepMeta = {
  icon: typeof Film;
  group: "影片處理" | "影片分析" | "影片生成";
  dependency: string;
  output: string;
};

const STEP_META: Record<number, StepMeta> = {
  1: { icon: Download, group: "影片處理", dependency: "來源連結", output: "來源 MP4" },
  2: { icon: FileText, group: "影片處理", dependency: "來源連結", output: "逐字稿" },
  3: { icon: ImageIcon, group: "影片處理", dependency: "來源連結", output: "影片影格" },
  4: { icon: Sparkles, group: "影片分析", dependency: "逐字稿 + 影格", output: "影片洞察" },
  5: { icon: Layers3, group: "影片生成", dependency: "影片分析", output: "改編腳本" },
  6: { icon: Clapperboard, group: "影片生成", dependency: "改編腳本", output: "9 張分鏡圖" },
  7: { icon: ImageIcon, group: "影片生成", dependency: "9 張分鏡圖", output: "單張分鏡圖" },
  8: { icon: Video, group: "影片生成", dependency: "單張分鏡圖", output: "最終影片" }
};

function buildProcessSteps(project: Project): StepInfo[] {
  const steps = (project.steps || {}) as Record<string, { status?: string; progress?: number; message?: string }>;
  const storyboardDone = project.scenes.length === 9 && project.scenes.every((scene) => scene.imageUrl);
  const mergeDone = Boolean(project.storyboardImageUrl);

  // 步驟 1-4（分析子步驟）：用 project.steps 的狀態 + 既有產物判斷。
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
  // 步驟 5-8（影片生成）：用整體 status + 產物判斷。
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
    errorMessage: typeof steps[key]?.message === "string" ? steps[key]?.message : undefined
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

function stepCanRun(project: Project, stepNumber: number) {
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

function hasNineStoryboardImages(project: Project) {
  return project.scenes.length === 9 && project.scenes.every((scene) => scene.imageUrl);
}

function stepBlockedReason(project: Project, stepNumber: number, busy = false) {
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

function stepActionLabel(project: Project, stepNumber: number) {
  const step = buildProcessSteps(project)[stepNumber - 1];
  if (!step) return "執行";
  if (step.state === "done" || step.state === "failed") return "重新執行";
  if (step.state === "active") return "執行中";
  return "開始執行";
}

function activeStepError(project: Project, stepNumber: number) {
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

// 抽影格間隔為 3 秒（lib/visual.ts 用 fps=1/3），故第 index 張約在 index*3 秒。
function frameTime(index: number) {
  const total = index * 3;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function sceneProgress(status: string): { pct: number; color: string } {
  switch (status) {
    case "IMAGE_GENERATING":
      return { pct: 30, color: "bg-orange" };
    case "QUEUED":
      return { pct: 60, color: "bg-orange" };
    case "GENERATING":
      return { pct: 80, color: "bg-orange" };
    case "SUCCEEDED":
      return { pct: 100, color: "bg-[var(--green)]" };
    case "FAILED":
      return { pct: 100, color: "bg-[var(--red)]" };
    default:
      return { pct: 10, color: "bg-orange" };
  }
}

function projectStatusLabel(status: string) {
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

function buildSeedancePreviewPrompt(scenes: Scene[]) {
  const sequence = scenes
    .map(
      (scene) =>
        `${scene.sceneNumber}. ${scene.title}\nVisual goal: ${scene.visualGoal}\nMotion prompt: ${scene.seedancePrompt}`
    )
    .join("\n\n");

  return [
    "Create one continuous short-form vertical video using the single reference image as a compressed visual storyboard for the full sequence.",
    "The reference image was created from 9 storyboard frames. Preserve fictional character design, wardrobe, style, setting continuity, and the narrative order from scene 1 to scene 9.",
    "Do not reproduce or imply any real person's identity, face, biometric details, private information, or celebrity likeness.",
    "Do not add subtitles, captions, logos, watermarks, or readable on-screen text. Use smooth cinematic transitions between storyboard beats.",
    "Storyboard sequence:",
    sequence
  ].join("\n\n");
}

function supportedDuration(value?: number) {
  return value === 15 ? 15 : 8;
}

function sourceEmbedUrl(url?: string) {
  if (!url) return "";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  const host = parsed.hostname.toLowerCase();

  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const tiktokVideoId = parsed.pathname.match(/\/@[^/]+\/video\/(\d+)/i)?.[1];
    return tiktokVideoId ? `https://www.tiktok.com/embed/v2/${tiktokVideoId}` : "";
  }
  return "";
}

export function ProjectClient({ projectId, initialProject }: { projectId: string; initialProject?: Project }) {
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(initialProject || null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [projectTitle, setProjectTitle] = useState(initialProject?.title || "");
  const [analysis, setAnalysis] = useState(initialProject?.analysis || "");
  const [structure, setStructure] = useState(initialProject?.structure || "");
  const [script, setScript] = useState(initialProject?.adaptedScript || "");
  const [ratio, setRatio] = useState(FIXED_VIDEO_RATIO);
  const [resolution, setResolution] = useState(FIXED_VIDEO_RESOLUTION);
  const [duration, setDuration] = useState(supportedDuration(initialProject?.duration));
  const [activeStep, setActiveStep] = useState<ActivePanel>("project");
  const [taskToastProject, setTaskToastProject] = useState<Project | null>(BUSY.includes(initialProject?.status || "") ? initialProject || null : null);
  const [taskToastDismissed, setTaskToastDismissed] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);
  const taskToastProjectRef = useRef<Project | null>(BUSY.includes(initialProject?.status || "") ? initialProject || null : null);
  const settingsInit = useRef(Boolean(initialProject));
  const lastServer = useRef<{ analysis?: string; structure?: string; adaptedScript?: string }>({
    analysis: initialProject?.analysis,
    structure: initialProject?.structure,
    adaptedScript: initialProject?.adaptedScript
  });

  function notifyProjectsChanged() {
    window.dispatchEvent(new Event("lurevid:projects-changed"));
  }

  useEffect(() => {
    if (!initialProject) return;
    setProject(initialProject);
    setProjectTitle(initialProject.title || "");
    setAnalysis(initialProject.analysis || "");
    setStructure(initialProject.structure || "");
    setScript(initialProject.adaptedScript || "");
    setRatio(FIXED_VIDEO_RATIO);
    setResolution(FIXED_VIDEO_RESOLUTION);
    setDuration(supportedDuration(initialProject.duration));
    lastServer.current = {
      analysis: initialProject.analysis,
      structure: initialProject.structure,
      adaptedScript: initialProject.adaptedScript
    };
    settingsInit.current = true;
  }, [initialProject, projectId]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (status?: string) => {
      if (stopped) return;
      const hidden = typeof document !== "undefined" && document.hidden;
      // 背景分頁拉長；有任務在跑時加快（讓步驟完成更即時反映）。
      const busyNow = status ? BUSY.includes(status) : false;
      const delay = hidden ? 20000 : busyNow ? 2500 : 5000;
      timer = setTimeout(load, delay);
    };

    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        const data = await res.json();
        if (stopped) return;
        if (!res.ok) {
          setError(data.error || "讀取失敗");
          schedule();
          return;
        }
        setError("");
        // 只有當伺服器的值改變時才覆寫本地編輯，避免蓋掉使用者正在編輯的內容。
        if (data.analysis !== lastServer.current.analysis) setAnalysis(data.analysis || "");
        if (data.structure !== lastServer.current.structure) setStructure(data.structure || "");
        if (data.adaptedScript !== lastServer.current.adaptedScript) setScript(data.adaptedScript || "");
        lastServer.current = { analysis: data.analysis, structure: data.structure, adaptedScript: data.adaptedScript };
        if (!settingsInit.current) {
          setRatio(FIXED_VIDEO_RATIO);
          setResolution(FIXED_VIDEO_RESOLUTION);
          if (data.duration) setDuration(supportedDuration(data.duration));
          settingsInit.current = true;
        }

        setProject(data);
        const currentBusy = BUSY.includes(data.status);
        if (currentBusy || taskToastProjectRef.current) {
          taskToastProjectRef.current = data;
          setTaskToastProject(data);
        }
        notifyProjectsChanged();
        // 終態（完成/失敗）就停止輪詢；其餘狀態繼續輪詢（有任務在跑時更頻繁）。
        if (!["COMPLETED", "FAILED"].includes(data.status)) schedule(data.status);
      } catch {
        if (stopped) return;
        setError("暫時讀不到專案資料，稍後會自動重試。");
        schedule();
      }
    }
    load();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, pollVersion]);

  async function post(path: string, payload?: Record<string, unknown>) {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {})
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "操作失敗");
        toast(data.error || "操作失敗", "error");
        return;
      }
      setProject(data);
      taskToastProjectRef.current = data;
      setTaskToastProject(data);
      setTaskToastDismissed(false);
      notifyProjectsChanged();
      setPollVersion((version) => version + 1);
    } catch {
      setError("API 沒有回應");
      toast("API 沒有回應", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveProjectTitle() {
    if (!project) return;
    const title = projectTitle.trim();
    if (!title || title === project.title) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "儲存名稱失敗");
        toast(data.error || "儲存名稱失敗", "error");
        return;
      }
      setProject(data);
      setProjectTitle(data.title || "");
      window.dispatchEvent(new Event("lurevid:projects-changed"));
      toast("已儲存專案名稱");
    } catch {
      setError("API 沒有回應");
      toast("API 沒有回應", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveAdaptedScript(nextScript: string): Promise<boolean> {
    if (!project) return false;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adaptedScript: nextScript })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "儲存改編腳本失敗");
        toast(data.error || "儲存改編腳本失敗", "error");
        return false;
      }
      setProject(data);
      setScript(data.adaptedScript || nextScript);
      lastServer.current = { analysis: data.analysis, structure: data.structure, adaptedScript: data.adaptedScript };
      toast("已儲存改編腳本");
      return true;
    } catch {
      setError("API 沒有回應");
      toast("API 沒有回應", "error");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  function runStep(stepNumber: number) {
    if (!project) return;
    setActiveStep(stepNumber as ActivePanel);
    if (stepNumber === 1) return void post("/source");
    if (stepNumber === 2) return void post("/transcribe");
    if (stepNumber === 3) return void post("/frames");
    if (stepNumber === 4) return void post("/analyze");
    if (stepNumber === 5) return void post("/adapt", { analysis: project.analysis || analysis, structure });
    if (stepNumber === 6) return void post("/storyboard", { adaptedScript: script });
    if (stepNumber === 7) return void post("/merge-storyboard");
    if (stepNumber === 8) return void post("/video", { ratio: FIXED_VIDEO_RATIO, resolution: FIXED_VIDEO_RESOLUTION, duration });
  }

  if (error && !project) return <div className="p-6 text-[var(--red)]">{error}</div>;
  if (!project) return <div className="grid min-h-screen place-items-center"><Loader2 className="animate-spin text-orange" /></div>;

  const busy = BUSY.includes(project.status) || submitting;
  const processSteps = buildProcessSteps(project);
  const doneSteps = processSteps.filter((step) => step.state === "done").length;
  const currentStep = typeof activeStep === "number" ? processSteps[activeStep - 1] : undefined;
  const currentMeta = typeof activeStep === "number" ? STEP_META[activeStep] : undefined;
  const currentBlockedReason = typeof activeStep === "number" ? stepBlockedReason(project, activeStep, busy) : "";
  const currentCanRun = typeof activeStep === "number" && !currentBlockedReason && stepCanRun(project, activeStep);
  const currentPanelTitle = activeStep === "project" ? "專案資料" : currentStep?.title || "專案資料";
  const currentPanelDescription = activeStep === "project"
    ? "管理來源連結、專案名稱與目前處理狀態。"
    : currentStep?.description || "";
  const shouldShowProjectStatusBadge = project.status !== "FAILED";
  const projectBadgeClass = project.status === "COMPLETED" ? "badge-active" : "badge-warn";
  const projectStatusBadge = shouldShowProjectStatusBadge ? <span className={`badge ${projectBadgeClass}`}>{projectStatusLabel(project.status)}</span> : null;
  const seedanceScenes = project.scenes.filter((scene) => scene.imageUrl);
  const canMergeStoryboard = hasNineStoryboardImages(project);
  const canGenerateVideo = Boolean(project.storyboardImageUrl);
  const seedancePrompt = buildSeedancePreviewPrompt(project.scenes);
  const downloadButton = project.sourceVideoUrl ? (
    <a className="btn btn-primary w-full sm:w-auto" href={project.sourceVideoUrl} download target="_blank" rel="noreferrer">
      <Download size={16} />
      下載 MP4
    </a>
  ) : (
    <button className="btn btn-ghost w-full cursor-default text-[var(--gray-400)] sm:w-auto" disabled type="button">
      尚未取得 MP4
    </button>
  );
  const namePanel = (
    <div className="rounded-xl border border-[var(--border)] bg-white p-3 text-sm md:p-4">
      <p className="mb-2 text-[11px] uppercase text-orange">專案命名</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="min-w-0 flex-1 rounded-lg border border-[var(--border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-orange"
          value={projectTitle}
          onChange={(event) => setProjectTitle(event.target.value)}
          onBlur={saveProjectTitle}
          onKeyDown={(event) => {
            if (event.key === "Enter") saveProjectTitle();
          }}
          placeholder="命名專案名稱"
        />
        <button className="btn btn-primary" disabled={submitting || !projectTitle.trim() || projectTitle.trim() === project.title} onClick={saveProjectTitle} type="button">
          儲存
        </button>
      </div>
    </div>
  );
  const projectDataPanel = (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="流程進度" value={`${doneSteps}/8`} />
        <MetricCard label="影格" value={`${project.sourceFrameUrls?.length || 0} 張`} />
        <MetricCard label="分鏡" value={`${seedanceScenes.length}/9`} />
      </div>
      {namePanel}
      <div className="rounded-xl border border-[var(--border)] bg-white p-3 text-sm md:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase text-orange">來源 · {project.sourcePlatform || "影片"}</p>
          {projectStatusBadge}
        </div>
        {project.sourceUrl && (
          <a className="flex items-start gap-2 break-all rounded-lg border border-[var(--border)] bg-[var(--warm-white)] p-3 text-xs leading-5 text-orange underline" href={project.sourceUrl} target="_blank" rel="noreferrer">
            <Link2 className="mt-0.5 shrink-0" size={14} />
            {project.sourceUrl}
          </a>
        )}
      </div>
    </div>
  );
  const downloadPanel = (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--border)] bg-white p-3 text-sm md:p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase text-orange">影片下載</p>
          <span className={`badge ${project.sourceVideoUrl ? "badge-active" : busy ? "badge-warn" : "badge-warn"}`}>
            {project.sourceVideoUrl ? "已取得 MP4" : busy ? "處理中" : "尚未取得"}
          </span>
        </div>
        {activeStepError(project, 1) && <p className="mt-3 rounded-lg bg-[var(--red-bg)] p-2 text-xs text-[var(--red)]">{activeStepError(project, 1)}</p>}
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-white p-3 md:p-4">
        {downloadButton}
        {!project.sourceVideoUrl && (project.analysis || project.sourceTranscript) && (
          <p className="mt-2 text-xs leading-5 text-[var(--gray-500)]">影片下載失敗，但已用可取得的音訊/內容完成後續分析。若需要 MP4，請重跑「影片下載」或換一支公開影片。</p>
        )}
      </div>
    </div>
  );
  const sourcePreview = sourceEmbedUrl(project.sourceUrl);
  const previewPanel = (
    <div className="w-full rounded-lg border border-[var(--border)] bg-white p-2">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[11px] uppercase text-[var(--gray-500)]">影片預覽</span>
        <span className="text-[11px] text-orange">{project.finalVideoUrl ? "最終影片" : project.sourceVideoUrl ? "來源 MP4" : "來源嵌入"}</span>
      </div>
      <div className="grid aspect-[9/16] w-full place-items-center overflow-hidden rounded-lg bg-[var(--warm-white)] text-sm text-[var(--gray-500)]">
        <div className="relative h-full w-full overflow-hidden">
          {project.finalVideoUrl ? (
            <video src={project.finalVideoUrl} controls playsInline className="h-full w-full object-contain" />
          ) : project.sourceVideoUrl ? (
            <video src={project.sourceVideoUrl} controls playsInline className="h-full w-full object-contain" />
          ) : sourcePreview ? (
            <iframe
              className="h-full w-full border-0 bg-transparent"
              src={sourcePreview}
              title="來源影片預覽"
              loading="lazy"
              allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
            />
          ) : (
            <div className="grid h-full place-items-center px-4 text-center text-xs leading-5">尚未取得可預覽的影片</div>
          )}
        </div>
      </div>
    </div>
  );
  const transcriptPanel = (
    <div className="card flex min-h-[calc(100dvh-96px)] flex-col p-3 md:h-[calc(100dvh-48px)] md:min-h-0 md:p-4">
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <h2 className="text-sm">轉錄音訊</h2>
        <span className="text-[11px] text-[var(--gray-500)]">逐字稿</span>
      </div>
      {project.sourceTranscript ? (
        <div className="min-h-0 flex-1">
          <TranscriptResult value={project.sourceTranscript} />
        </div>
      ) : (
        <EmptyPanel title="尚未取得逐字稿" description="worker 會在下載影片後自動轉錄音訊。" />
      )}
    </div>
  );
  const framePanel = (
    <div className="card p-3 md:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm">抽取影格</h2>
        <span className="text-[11px] text-[var(--gray-500)]">{project.sourceFrameUrls?.length || 0} 張</span>
      </div>
      {project.sourceFrameUrls?.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {project.sourceFrameUrls.map((url, index) => (
            <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-white" key={`${url}-${index}`}>
              <div className="aspect-[9/16] bg-[var(--warm-white)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`影格 ${index + 1}`} className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center justify-between px-3 py-2 text-xs text-[var(--gray-500)]">
                <span>影格 {String(index + 1).padStart(2, "0")}</span>
                <span className="tabular-nums text-orange">{frameTime(index)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyPanel title="尚未抽取影格" description="按工作清單第 3 步的 play，系統會用 ffmpeg 從影片抽出代表性畫面。" />
      )}
    </div>
  );
  const storyboardPanel = (
    <div className="card p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm">產生分鏡</h2>
      </div>
      {project.scenes.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {project.scenes.map((scene) => (
            <article key={scene.id} className="card p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-orange">{String(scene.sceneNumber).padStart(2, "0")}</span>
              </div>
              <h3 className="text-sm">{scene.title}</h3>
              <div className="mt-3 grid aspect-[9/16] place-items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--warm-white)]">
                {scene.videoUrl ? (
                  <video src={scene.videoUrl} className="h-full w-full object-cover" muted loop autoPlay playsInline />
                ) : scene.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scene.imageUrl} alt={scene.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 size={22} className="animate-spin text-orange" />
                    <span className="text-sm tabular-nums text-orange">{sceneProgress(scene.status).pct}%</span>
                    <span className="text-xs text-[var(--gray-500)]">分鏡圖生成中</span>
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--gray-500)]">{scene.visualGoal}</p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyPanel title="尚未產生分鏡" description="完成改編腳本後，可以在這裡產生並確認分鏡圖。" />
      )}
    </div>
  );
  const mergeStoryboardPanel = (
    <div className="p-1 md:p-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm">合併分鏡</h2>
          <p className="mt-1 text-xs text-[var(--gray-500)]">把第 6 步的 9 張圖合併成同一張分鏡圖，作為 Seedance 的單張參考圖。</p>
        </div>
        {canMergeStoryboard && (
          <button className="btn btn-primary" disabled={busy || submitting} onClick={() => post("/merge-storyboard")} type="button">
            <Play size={14} />
            {project.storyboardImageUrl ? "重新合併" : "開始合併"}
          </button>
        )}
      </div>

      <div className="mb-3 grid gap-2 rounded-xl border border-[var(--border)] bg-white p-3 text-xs text-[var(--gray-500)] sm:grid-cols-3">
        <div>
          <span className="block text-[var(--gray-400)]">輸入分鏡</span>
          <strong className="text-sm text-[var(--black)]">{seedanceScenes.length}/9</strong>
        </div>
        <div>
          <span className="block text-[var(--gray-400)]">比例</span>
          <strong className="text-sm text-[var(--black)]">{ratio}</strong>
        </div>
        <div>
          <span className="block text-[var(--gray-400)]">輸出</span>
          <strong className="text-sm text-[var(--black)]">{project.storyboardImageUrl ? "已完成" : "待合併"}</strong>
        </div>
      </div>

      {project.scenes.length > 0 ? (
        <div className="grid aspect-[9/16] w-full max-w-[520px] place-items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--warm-white)]">
          {project.storyboardImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={project.storyboardImageUrl} alt="Seedance 單張腳本分鏡圖" className="h-full w-full object-contain" />
          ) : project.status === "STORYBOARDING" && project.steps?.mergeStoryboard?.status === "running" ? (
            <div className="px-4 text-center text-sm leading-6 text-[var(--gray-500)]">
              <Loader2 className="mx-auto mb-2 animate-spin text-orange" size={24} />
              正在合成單張分鏡圖
            </div>
          ) : (
            <span className="px-4 text-center text-sm text-[var(--gray-500)]">完成第 6 步後，按下開始合併會在這裡顯示單張分鏡圖</span>
          )}
        </div>
      ) : (
        <EmptyPanel title="尚未產生分鏡圖" description="第 7 步會把第 6 步的 9 張分鏡圖合併成單張參考圖。" />
      )}
    </div>
  );
  const videoPanel = (
    <div className="p-1 md:p-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm">生成影片</h2>
          <p className="mt-1 text-xs text-[var(--gray-500)]">把第 7 步的單張分鏡圖送給 Seedance。</p>
        </div>
        {canGenerateVideo && (
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <select className="rounded-full border border-[var(--border-strong)] px-3 py-2 text-sm sm:py-1" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
              <option value={8}>每段 8 秒</option>
              <option value={15}>每段 15 秒</option>
            </select>
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--gray-500)] sm:py-1">9:16</span>
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--gray-500)] sm:py-1">720p</span>
            <button
              className="btn btn-primary"
              disabled={busy || submitting}
              onClick={() => post("/video", { ratio: FIXED_VIDEO_RATIO, resolution: FIXED_VIDEO_RESOLUTION, duration })}
              type="button"
            >
              <Play size={14} />
              {project.finalVideoUrl ? "重新生成" : "送出生成"}
            </button>
          </div>
        )}
      </div>

      <div className="mb-3 grid gap-2 rounded-xl border border-[var(--border)] bg-white p-3 text-xs text-[var(--gray-500)] sm:grid-cols-4">
        <div>
          <span className="block text-[var(--gray-400)]">單張分鏡圖</span>
          <strong className="text-sm text-[var(--black)]">{project.storyboardImageUrl ? "已完成" : "尚未完成"}</strong>
        </div>
        <div>
          <span className="block text-[var(--gray-400)]">比例</span>
          <strong className="text-sm text-[var(--black)]">{ratio}</strong>
        </div>
        <div>
          <span className="block text-[var(--gray-400)]">解析度</span>
          <strong className="text-sm text-[var(--black)]">{resolution}</strong>
        </div>
        <div>
          <span className="block text-[var(--gray-400)]">單段長度</span>
          <strong className="text-sm text-[var(--black)]">{duration} 秒</strong>
        </div>
      </div>

      {project.storyboardImageUrl ? (
        <div className="space-y-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="p-1 md:p-2">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm">Seedance 單張腳本分鏡圖</h3>
                  <p className="mt-1 text-xs text-[var(--gray-500)]">這張圖會搭配 prompt 一起送給 Seedance。</p>
                </div>
              </div>
              <div className="grid aspect-[9/16] w-full place-items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--warm-white)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={project.storyboardImageUrl} alt="Seedance 單張腳本分鏡圖" className="h-full w-full object-contain" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-1 md:p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm">Seedance 回傳影片</h3>
                  <span className="text-[11px] text-[var(--gray-500)]">1 支影片</span>
                </div>
                <div className="grid aspect-[9/16] place-items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--warm-white)]">
                  {project.finalVideoUrl ? (
                    <video src={project.finalVideoUrl} className="h-full w-full object-contain" controls playsInline />
                  ) : ["GENERATING", "MERGING"].includes(project.status) ? (
                    <div className="px-4 text-center text-sm leading-6 text-[var(--gray-500)]">
                      <Loader2 className="mx-auto mb-2 animate-spin text-orange" size={24} />
                      正在用單張分鏡圖與 prompt 生成影片
                    </div>
                  ) : (
                    <span className="px-4 text-center text-sm text-[var(--gray-500)]">送出後會在這裡顯示最終影片</span>
                  )}
                </div>
              </div>

              <details className="rounded-xl border border-[var(--border)] bg-white p-3" open>
                <summary className="cursor-pointer text-sm">合併 prompt</summary>
                <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--warm-white)] p-3 text-xs leading-5 text-[var(--gray-500)]">{seedancePrompt}</pre>
              </details>
            </div>
          </div>
        </div>
      ) : (
        <EmptyPanel title="尚未合併分鏡" description="第 8 步會把第 7 步的單張分鏡圖送給 Seedance；請先完成第 7 步。" />
      )}
    </div>
  );
  const selectedPanel = (() => {
    if (activeStep === "project") return projectDataPanel;
    if (activeStep === 1) return downloadPanel;
    if (activeStep === 2) return transcriptPanel;
    if (activeStep === 3) return framePanel;
    if (activeStep === 4) {
      return project.analysis ? (
        <ResultCard title="影片分析" value={analysis} />
      ) : (
        <div className="card p-4"><EmptyPanel title="尚未完成影片分析" description="完成轉錄與抽取影格後，會整合畫面與逐字稿產出洞察。" /></div>
      );
    }
    if (activeStep === 5) {
      return project.adaptedScript ? (
        <StepCard title="改編腳本" value={script} onChange={setScript} onSave={saveAdaptedScript} saving={submitting} />
      ) : (
        <div className="card p-4"><EmptyPanel title="尚未改編腳本" description="完成影片分析後，系統會先拆解結構，再改寫成新的短影音腳本。" /></div>
      );
    }
    if (activeStep === 6) return storyboardPanel;
    if (activeStep === 7) return mergeStoryboardPanel;
    if (activeStep === 8) return videoPanel;
    return projectDataPanel;
  })();
  const currentStepError = typeof activeStep === "number" ? activeStepError(project, activeStep) : "";

  return (
    <div className="min-h-screen bg-[var(--warm-white)]">
      <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-[340px_minmax(0,1fr)] md:gap-4 md:p-6">
        <aside className="space-y-4 md:sticky md:top-6 md:h-fit">
          <ProcessTimeline project={project} activeStep={activeStep} onSelectStep={setActiveStep} previewPanel={previewPanel} />
        </aside>

        <section className="min-w-0 space-y-3">
          <div className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[0_14px_40px_rgb(26_26_26/0.03)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-lg tracking-normal text-[var(--black)] md:text-xl">{currentPanelTitle}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--gray-500)]">{currentPanelDescription}</p>
              </div>
              {typeof activeStep === "number" && (
                <button
                  className="btn btn-primary h-10 w-full shrink-0 lg:w-auto"
                  disabled={!currentCanRun}
                  onClick={() => runStep(activeStep)}
                  title={currentBlockedReason || stepActionLabel(project, activeStep)}
                  type="button"
                >
                  {currentStep?.state === "active" ? <Loader2 size={15} className="animate-spin" /> : currentStep?.state === "done" || currentStep?.state === "failed" ? <RotateCcw size={15} /> : <Play size={15} fill="currentColor" />}
                  {stepActionLabel(project, activeStep)}
                </button>
              )}
            </div>

            {currentMeta && (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <RequirementCard label="依賴" value={currentMeta.dependency} />
                <RequirementCard label="產出" value={currentMeta.output} />
                <RequirementCard label={currentBlockedReason ? "尚不能執行" : "狀態"} value={currentBlockedReason || (currentStep?.state === "done" ? "可重跑" : currentStep?.state === "active" ? "執行中" : "可執行")} tone={currentBlockedReason ? "warn" : currentStep?.state === "done" ? "ok" : "default"} />
              </div>
            )}
          </div>
          {currentStepError && (
            <div className="mb-3 rounded-xl border border-[var(--red)] bg-[var(--red-bg)] p-3 text-sm leading-6 text-[var(--red)]">
              {currentStepError}
            </div>
          )}
          {selectedPanel}
        </section>
      </div>
      {taskToastProject && !taskToastDismissed && (
        <ProjectProgressToast project={taskToastProject} running={BUSY.includes(taskToastProject.status)} onClose={() => setTaskToastDismissed(true)} />
      )}
    </div>
  );
}

function ProjectProgressToast({ project, running, onClose }: { project: Project; running: boolean; onClose: () => void }) {
  const steps = buildProcessSteps(project);
  const activeStep = steps.find((step) => step.state === "active");
  const failed = project.status === "FAILED";
  const title = running ? activeStep?.title || "任務執行中" : failed ? "任務失敗" : "任務完成";
  const message = project.message || activeStep?.description || "正在處理專案";

  return (
    <div className="fixed bottom-5 right-5 z-[90] w-[min(360px,calc(100vw-32px))] rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_60px_rgb(26_26_26/0.16)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {running ? (
              <Loader2 className="shrink-0 animate-spin text-orange" size={16} />
            ) : failed ? (
              <X className="shrink-0 text-[var(--red)]" size={16} />
            ) : (
              <Check className="shrink-0 text-orange" size={16} />
            )}
            <h3 className="truncate text-sm">{title}</h3>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--gray-500)]">{message}</p>
        </div>
        {!running && (
          <button className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--gray-400)] hover:bg-[var(--warm-white)] hover:text-[var(--black)]" onClick={onClose} title="關閉進度" type="button">
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function ProcessTimeline({
  project,
  activeStep,
  onSelectStep,
  previewPanel
}: {
  project: Project;
  activeStep: ActivePanel;
  onSelectStep: (step: ActivePanel) => void;
  previewPanel: ReactNode;
}) {
  const steps = buildProcessSteps(project);
  const [previewOpen, setPreviewOpen] = useState(true);

  return (
    <div className="process-card rounded-xl border border-[var(--border)] bg-white p-1.5 md:p-2">
      <div className="mb-1.5 flex items-center justify-between gap-3 px-1 md:mb-2">
        <div>
          <h2 className="text-xs md:text-sm">功能選單</h2>
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 md:block md:space-y-0.5 md:overflow-visible md:pb-0">
        <div className="min-w-[220px] md:min-w-0">
          <div
            className={`process-step rounded-lg border px-2 py-1.5 md:px-2 md:py-1.5 ${
              activeStep === "project" ? "bg-orange-bg text-orange" : "text-[var(--black)] hover:bg-[var(--warm-white)]"
            } ${activeStep === "project" ? "border-[var(--orange-border)]" : "border-transparent"}`}
            data-active={activeStep === "project"}
          >
            <div className="flex min-w-0 items-center gap-1">
              <button className="process-tab flex min-w-0 flex-1 items-center gap-2 rounded-md py-0.5 text-left" onClick={() => onSelectStep("project")} type="button">
                <span className="process-status grid h-6 w-6 shrink-0 place-items-center rounded-full border border-orange bg-orange text-white" title="專案資料">
                  <Link2 size={13} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs leading-4 md:text-sm md:leading-5">專案資料</span>
                </span>
              </button>
              <button
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-orange hover:bg-white/70"
                onClick={() => setPreviewOpen((open) => !open)}
                title={previewOpen ? "收合影片預覽" : "展開影片預覽"}
                type="button"
              >
                <ChevronDown className={`transition-transform ${previewOpen ? "rotate-180" : ""}`} size={15} />
              </button>
            </div>
          </div>
          {previewOpen && <div className="mt-2 hidden md:block">{previewPanel}</div>}
        </div>
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isDone = step.state === "done";
          const isActive = step.state === "active";
          const isFailed = step.state === "failed";
          const sectionLabel = stepNumber === 1 ? "影片處理" : stepNumber === 4 ? "影片分析" : stepNumber === 5 ? "影片生成" : null;
          const selected = activeStep === stepNumber;
          const stateLabel = isFailed ? "失敗" : isActive ? "進行中" : isDone ? "完成" : "待處理";
          const meta = STEP_META[stepNumber];
          const Icon = meta.icon;

          return (
            <div className="contents" key={step.title}>
              {sectionLabel && (
                <div className={`px-1.5 pt-1 text-[10px] uppercase tracking-wide text-[var(--gray-500)] md:px-2 md:pt-1 md:text-[11px] ${stepNumber !== 1 ? "md:mt-1 md:border-t md:border-[var(--border)]" : ""}`}>
                  {sectionLabel}
                </div>
              )}
              <div
                className={`process-step min-w-[170px] rounded-lg border px-2 py-1.5 md:min-w-0 md:px-2 md:py-1.5 ${
                  selected
                    ? "bg-orange-bg text-orange"
                    : "text-[var(--black)] hover:bg-[var(--warm-white)]"
                } ${selected ? "border-[var(--orange-border)]" : "border-transparent"}`}
                data-active={selected}
                data-running={isActive}
              >
                <div className="flex items-start">
                  <button
                    className="process-tab flex min-w-0 flex-1 items-center gap-2 rounded-md py-0.5 text-left"
                    onClick={() => onSelectStep(stepNumber as ActivePanel)}
                    type="button"
                  >
                    <span
                      className={`process-status grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                        isFailed
                          ? "border-[var(--red)] bg-[var(--red-bg)] text-[var(--red)]"
                        : isDone
                            ? "border-orange bg-orange text-white"
                            : isActive
                              ? "border-orange bg-orange-bg text-orange"
                              : "border-[var(--gray-200)] bg-white text-[var(--gray-300)]"
                      }`}
                      title={stateLabel}
                    >
                      {isActive ? <Loader2 size={13} className="animate-spin" /> : isFailed ? <X size={13} /> : isDone ? <Check size={13} /> : <Icon size={13} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs leading-4 md:text-sm md:leading-5">{stepNumber}. {step.title}</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-3">
      <span className="block text-[11px] text-[var(--gray-500)]">{label}</span>
      <strong className="mt-1 block text-lg text-[var(--black)]">{value}</strong>
    </div>
  );
}

function RequirementCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "ok" | "warn" }) {
  const toneClass = tone === "ok" ? "border-[var(--green-bg)] bg-[var(--green-bg)] text-[var(--green)]" : tone === "warn" ? "border-[#fff3e0] bg-[#fff8ec] text-[#9f4a00]" : "border-[var(--border)] bg-[var(--warm-white)] text-[var(--black)]";

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <span className="block text-[11px] opacity-75">{label}</span>
      <strong className="mt-0.5 block text-sm">{value}</strong>
    </div>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-xl border border-dashed border-[var(--border-strong)] bg-white p-4 text-center md:min-h-[260px] md:p-6">
      <div>
        <h3 className="text-sm">{title}</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-[var(--gray-500)]">{description}</p>
      </div>
    </div>
  );
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong className=" text-[var(--black)]" key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    return part;
  });
}

function removeOneSentenceSummary(value: string) {
  const lines = value.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const normalized = line
      .replace(/^#{1,6}\s*/, "")
      .replace(/^\d+\s*[.、．]\s*/, "")
      .trim();
    return normalized.includes("一句話總結");
  });
  if (start === -1) return value;
  return lines.slice(0, start).join("\n").trimEnd();
}

function MarkdownResult({ value }: { value: string }) {
  const lines = useMemo(() => removeOneSentenceSummary(value).split(/\r?\n/), [value]);

  return (
    <div className="h-full overflow-y-auto px-1 py-1 text-sm leading-7">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div className="h-3" key={index} />;
        if (/^-{3,}$/.test(trimmed)) return <div className="my-4 h-px bg-[var(--border)]" key={index} />;

        const heading = trimmed.match(/^#{1,4}\s*(.+)$/);
        if (heading) {
          return (
            <h3 className="mt-4 text-base text-[var(--black)] first:mt-0" key={index}>
              {renderInlineMarkdown(heading[1])}
            </h3>
          );
        }

        const bullet = trimmed.match(/^-\s+(.+)$/);
        if (bullet) {
          return (
            <div className="flex gap-2 text-[var(--black)]" key={index}>
              <span className="mt-[0.72em] h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />
              <p>{renderInlineMarkdown(bullet[1])}</p>
            </div>
          );
        }

        return (
          <p className="text-[var(--black)]" key={index}>
            {renderInlineMarkdown(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function parseStructuredResult(value: string) {
  try {
    const parsed = JSON.parse(value) as {
      sections?: Array<{ title?: string; bullets?: string[] }>;
    };
    const sections = parsed.sections || [];
    if (!sections.length) return null;
    return sections
      .map((section) => ({
        title: section.title?.trim() || "",
        bullets: Array.isArray(section.bullets) ? section.bullets.filter(Boolean) : []
      }))
      .filter((section) => section.title && section.bullets.length);
  } catch {
    return null;
  }
}

function StructuredResult({ value }: { value: string }) {
  const sections = useMemo(() => parseStructuredResult(value), [value]);
  if (!sections) return <MarkdownResult value={value} />;

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="grid gap-3 lg:grid-cols-2">
        {sections.map((section) => (
          <section className="rounded-xl border border-[var(--border)] bg-white p-3 md:p-4" key={section.title}>
            <h3 className="text-sm text-[var(--black)]">{section.title}</h3>
            <div className="mt-3 space-y-2">
              {section.bullets.map((bullet, index) => (
                <div className="flex gap-2 text-sm leading-6 text-[var(--black)]" key={`${section.title}-${index}`}>
                  <span className="mt-[0.72em] h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />
                  <p>{bullet}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function TranscriptResult({ value }: { value: string }) {
  const rows = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\[([^\]]+)\]\s*(.+)$/);
      return match ? { time: match[1], text: match[2] } : { time: "00:00", text: line };
    });

  return (
    <div className="h-full overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-2 text-sm md:p-3">
      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 border-b border-[var(--border)] px-2 pb-2 text-xs text-[var(--gray-500)] sm:grid-cols-[112px_minmax(0,1fr)]">
        <div>秒數</div>
        <div>逐字稿</div>
      </div>
      <div className="space-y-1 pt-1">
        {rows.map((row, index) => (
          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 rounded-lg px-2 py-2 sm:grid-cols-[112px_minmax(0,1fr)]" key={`${row.time}-${index}`}>
            <div className="text-xs leading-6 text-[var(--gray-500)]">
              {row.time}
            </div>
            <p className="leading-6 text-[var(--black)]">{row.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function parseStoryboardScript(value: string) {
  try {
    const parsed = JSON.parse(value) as {
      scenes?: Array<{ sceneNumber?: number; title?: string; visualGoal?: string }>;
    };
    const scenes = parsed.scenes || [];
    if (scenes.length !== 9) return null;
    return scenes.map((scene, index) => ({
      sceneNumber: scene.sceneNumber || index + 1,
      title: scene.title || `第 ${index + 1} 格`,
      visualGoal: scene.visualGoal || ""
    }));
  } catch {
    return null;
  }
}

type EditableStoryboardScene = {
  sceneNumber: number;
  title: string;
  visualGoal: string;
};

function stringifyStoryboardScript(original: string, scenes: EditableStoryboardScene[]) {
  try {
    const parsed = JSON.parse(original) as Record<string, unknown>;
    return JSON.stringify({ ...parsed, scenes }, null, 2);
  } catch {
    return JSON.stringify({ scenes }, null, 2);
  }
}

function ResultCard({
  title,
  value
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="card flex min-h-[calc(100dvh-96px)] flex-col p-3 md:h-[calc(100dvh-48px)] md:min-h-0 md:p-4">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-sm">{title}</h2>
        <span className="text-[11px] text-[var(--gray-500)]">分析結果</span>
      </div>
      <div className="min-h-0 flex-1">
        <StructuredResult value={value} />
      </div>
    </div>
  );
}

function StepCard({
  title,
  value,
  onChange,
  onSave,
  saving = false
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  onSave?: (value: string) => boolean | Promise<boolean>;
  saving?: boolean;
}) {
  const storyboardScript = useMemo(() => parseStoryboardScript(value), [value]);
  const [editing, setEditing] = useState(false);
  const [draftScenes, setDraftScenes] = useState<EditableStoryboardScene[]>(storyboardScript || []);

  useEffect(() => {
    if (!editing) setDraftScenes(storyboardScript || []);
  }, [editing, storyboardScript]);

  function updateDraftScene(sceneNumber: number, field: "title" | "visualGoal", nextValue: string) {
    setDraftScenes((scenes) =>
      scenes.map((scene) =>
        scene.sceneNumber === sceneNumber ? { ...scene, [field]: nextValue } : scene
      )
    );
  }

  async function saveDraft() {
    const nextValue = stringifyStoryboardScript(value, draftScenes);
    onChange(nextValue);
    const saved = await onSave?.(nextValue);
    if (saved !== false) setEditing(false);
  }

  return (
    <div className="card flex min-h-[calc(100dvh-96px)] flex-col p-3 md:h-[calc(100dvh-48px)] md:min-h-0 md:p-4">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-sm">{title}</h2>
        {storyboardScript && (
          editing ? (
            <button className="btn btn-primary h-8 px-3 text-xs" disabled={saving} onClick={saveDraft} type="button">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              儲存
            </button>
          ) : (
            <button className="grid h-8 w-8 place-items-center rounded-full border border-[var(--border)] text-orange hover:bg-orange-bg" onClick={() => setEditing(true)} title="編輯分鏡細節" type="button">
              <Pencil size={14} />
            </button>
          )
        )}
      </div>
      {storyboardScript && (
        <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
          {(editing ? draftScenes : storyboardScript).map((scene) => (
            <article className="rounded-xl border border-[var(--border)] bg-[var(--warm-white)] p-3" key={scene.sceneNumber}>
              <div className="mb-2 text-xs tabular-nums text-orange">{String(scene.sceneNumber).padStart(2, "0")}</div>
              {editing ? (
                <div className="space-y-2">
                  <input
                    className="w-full rounded-lg border border-[var(--border-strong)] bg-white px-2.5 py-2 text-sm outline-none focus:border-orange"
                    value={scene.title}
                    onChange={(event) => updateDraftScene(scene.sceneNumber, "title", event.target.value)}
                    placeholder="分鏡標題"
                  />
                  <textarea
                    className="min-h-[120px] w-full resize-none rounded-lg border border-[var(--border-strong)] bg-white px-2.5 py-2 text-xs leading-5 outline-none focus:border-orange"
                    value={scene.visualGoal}
                    onChange={(event) => updateDraftScene(scene.sceneNumber, "visualGoal", event.target.value)}
                    placeholder="分鏡細節"
                  />
                </div>
              ) : (
                <>
                  <h3 className="text-sm">{scene.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-[var(--gray-500)]">{scene.visualGoal}</p>
                </>
              )}
            </article>
          ))}
        </div>
      )}
      {!storyboardScript && (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-white p-3 text-sm leading-7 text-[var(--gray-500)] md:p-4">
          {value}
        </div>
      )}
    </div>
  );
}
