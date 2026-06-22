"use client";

import { Check, ChevronDown, Clapperboard, Download, FileText, Film, ImageIcon, Layers3, Link2, Loader2, Pencil, Play, RotateCcw, Save, Sparkles, Trash2, Video, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import {
  activeStepError,
  buildProcessSteps,
  hasNineStoryboardImages,
  stepActionLabel,
  stepBlockedReason,
  stepCanRun,
  type Project,
  type Scene,
  type StepState
} from "@/lib/project-state";

const BUSY = ["QUEUED", "ANALYZING", "STRUCTURING", "ADAPTING", "STORYBOARDING", "GENERATING", "MERGING"];
const FIXED_VIDEO_RATIO = "9:16";
const FIXED_VIDEO_RESOLUTION = "720p";
type ActivePanel = "project" | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

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
type StepKey = "source" | "transcribe" | "frames" | "analyze" | "adapt" | "storyboard" | "mergeStoryboard" | "video";
const OPTIMISTIC_STEP_META: Record<number, { key: StepKey; status: string; message: string; progress: number }> = {
  1: { key: "source", status: "ANALYZING", message: "正在下載來源影片", progress: 0.05 },
  2: { key: "transcribe", status: "ANALYZING", message: "正在轉錄音訊", progress: 0.12 },
  3: { key: "frames", status: "ANALYZING", message: "正在抽取影片影格", progress: 0.18 },
  4: { key: "analyze", status: "ANALYZING", message: "正在做影片分析", progress: 0.28 },
  5: { key: "adapt", status: "ADAPTING", message: "正在改編腳本", progress: 0.38 },
  6: { key: "storyboard", status: "STORYBOARDING", message: "正在產生分鏡與 9 張分鏡圖", progress: 0.45 },
  7: { key: "mergeStoryboard", status: "STORYBOARDING", message: "正在把 9 張分鏡合成單張分鏡圖", progress: 0.52 },
  8: { key: "video", status: "GENERATING", message: "正在建立 Seedance 影片任務", progress: 0.62 }
};

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
    "Create one continuous short-form vertical video by following the attached single reference image exactly as a 3x3 storyboard.",
    "Read the storyboard panels in normal order: top-left to top-right, middle-left to middle-right, bottom-left to bottom-right. Treat them as scene 1 through scene 9.",
    "Preserve the main model's face, identity, hairstyle, hair length, wardrobe, body type, and overall appearance from the reference image. Do not replace the model, do not change facial features, and do not redesign the character.",
    "Use each storyboard panel as the visual anchor for its matching scene. Follow the composition, camera angle, pose, salon environment, hair details, lighting, and progression shown in that panel.",
    "Use the scene descriptions below as the motion/story guidance from step 6. The reference image is the source of visual truth; the text is only to clarify movement and sequence.",
    "Do not add subtitles, captions, logos, watermarks, UI, labels, frame numbers, or readable on-screen text.",
    "Make transitions smooth and cinematic while keeping the sequence faithful to the 9 panels.",
    "Step 6 storyboard sequence:",
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);

  const [projectTitle, setProjectTitle] = useState(initialProject?.title || "");
  const [analysis, setAnalysis] = useState(initialProject?.analysis || "");
  const [structure, setStructure] = useState(initialProject?.structure || "");
  const [script, setScript] = useState(initialProject?.adaptedScript || "");
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

  function notifyProjectOptimistic(nextProject: Project) {
    window.dispatchEvent(new CustomEvent("lurevid:project-optimistic", {
      detail: {
        id: nextProject.id,
        status: nextProject.status,
        progress: nextProject.progress,
        steps: nextProject.steps,
        updatedAt: new Date().toISOString()
      }
    }));
  }

  function optimisticProjectForStep(current: Project, stepNumber: number): Project {
    const meta = OPTIMISTIC_STEP_META[stepNumber];
    if (!meta) return current;
    return {
      ...current,
      status: meta.status,
      message: meta.message,
      progress: Math.max(current.progress || 0, meta.progress),
      error: undefined,
      steps: {
        ...(current.steps || {}),
        [meta.key]: {
          ...(current.steps?.[meta.key] || {}),
          status: "running",
          progress: meta.progress,
          message: meta.message
        }
      }
    };
  }

  function applyOptimisticStep(stepNumber: number) {
    setProject((current) => {
      if (!current) return current;
      const next = optimisticProjectForStep(current, stepNumber);
      taskToastProjectRef.current = next;
      setTaskToastProject(next);
      setTaskToastDismissed(false);
      notifyProjectOptimistic(next);
      return next;
    });
  }

  useEffect(() => {
    if (!initialProject) return;
    setProject(initialProject);
    setProjectTitle(initialProject.title || "");
    setAnalysis(initialProject.analysis || "");
    setStructure(initialProject.structure || "");
    setScript(initialProject.adaptedScript || "");
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

  async function post(path: string, payload?: Record<string, unknown>, rollbackProject?: Project) {
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
        if (rollbackProject) {
          setProject(rollbackProject);
          notifyProjectOptimistic(rollbackProject);
        }
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
      if (rollbackProject) {
        setProject(rollbackProject);
        notifyProjectOptimistic(rollbackProject);
      }
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

  async function deleteProject() {
    if (!project) return;
    setDeletingProject(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "刪除專案失敗");
        toast(data.error || "刪除專案失敗", "error");
        return;
      }
      notifyProjectsChanged();
      toast("已刪除專案");
      window.location.assign("/");
    } catch {
      setError("API 沒有回應");
      toast("API 沒有回應", "error");
    } finally {
      setDeletingProject(false);
    }
  }

  function runStep(stepNumber: number) {
    if (!project) return;
    const rollbackProject = project;
    setActiveStep(stepNumber as ActivePanel);
    applyOptimisticStep(stepNumber);
    if (stepNumber === 1) return void post("/source", undefined, rollbackProject);
    if (stepNumber === 2) return void post("/transcribe", undefined, rollbackProject);
    if (stepNumber === 3) return void post("/frames", undefined, rollbackProject);
    if (stepNumber === 4) return void post("/analyze", undefined, rollbackProject);
    if (stepNumber === 5) return void post("/adapt", { analysis: project.analysis || analysis, structure }, rollbackProject);
    if (stepNumber === 6) return void post("/storyboard", { adaptedScript: script }, rollbackProject);
    if (stepNumber === 7) return void post("/merge-storyboard", undefined, rollbackProject);
    if (stepNumber === 8) return void post("/video", { ratio: FIXED_VIDEO_RATIO, resolution: FIXED_VIDEO_RESOLUTION, duration }, rollbackProject);
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
  const canGenerateVideo = Boolean(project.storyboardImageUrl);
  const seedancePrompt = buildSeedancePreviewPrompt(project.scenes);
  const videoControls = canGenerateVideo ? (
    <div className="grid w-full grid-cols-1 gap-1.5 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
      <select className="h-8 rounded-full border border-[var(--border-strong)] px-3 text-xs" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
        <option value={8}>每段 8 秒</option>
        <option value={15}>每段 15 秒</option>
      </select>
      <span className="grid h-8 place-items-center rounded-full border border-[var(--border)] bg-white px-3 text-xs text-[var(--gray-500)]">9:16</span>
      <span className="grid h-8 place-items-center rounded-full border border-[var(--border)] bg-white px-3 text-xs text-[var(--gray-500)]">720p</span>
      <button
        className="btn btn-primary h-8 px-3 text-xs"
        disabled={busy || submitting}
        onClick={() => runStep(8)}
        type="button"
      >
        <Play size={14} />
        {project.finalVideoUrl ? "重新生成" : "送出生成"}
      </button>
    </div>
  ) : null;
  const isUploadedSource = project.sourcePlatform === "上傳影片";
  const downloadButton = isUploadedSource ? (
    <button className="btn btn-ghost w-full cursor-default text-[var(--gray-400)] sm:w-auto" disabled type="button">
      上傳影片僅供分析
    </button>
  ) : project.sourceVideoUrl ? (
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
        {!isUploadedSource && !project.sourceVideoUrl && (project.analysis || project.sourceTranscript) && (
          <p className="mt-2 text-xs leading-5 text-[var(--gray-500)]">影片下載失敗，但已用可取得的音訊/內容完成後續分析。若需要 MP4，請重跑「影片下載」或換一支公開影片。</p>
        )}
      </div>
    </div>
  );
  const sourcePreview = sourceEmbedUrl(project.sourceUrl);
  const previewPanel = (
    <div className="w-full rounded-lg border border-[var(--border)] bg-white p-1.5">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] uppercase text-[var(--gray-500)]">影片預覽</span>
        <span className="text-[10px] text-orange">{project.sourceVideoUrl ? "來源 MP4" : "來源嵌入"}</span>
      </div>
      <div className="mx-auto grid aspect-[9/16] w-full max-w-[220px] place-items-center overflow-hidden rounded-lg bg-[var(--warm-white)] text-xs text-[var(--gray-500)]">
        <div className="relative h-full w-full overflow-hidden">
          {project.sourceVideoUrl ? (
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
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
    <div className="card p-3 md:p-4">
      {project.scenes.length > 0 ? (
        <div className="grid aspect-[9/16] w-full place-items-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--warm-white)] md:w-[30%] md:min-w-[320px] md:max-w-[520px]">
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
    <div>
      {project.storyboardImageUrl ? (
        <div className="space-y-2">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,360px)_minmax(0,360px)] 2xl:grid-cols-[minmax(0,400px)_minmax(0,400px)]">
            <div>
              <div className="grid aspect-[9/16] w-full max-w-[400px] place-items-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--warm-white)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={project.storyboardImageUrl} alt="Seedance 單張腳本分鏡圖" className="h-full w-full object-contain" />
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs md:text-sm">Seedance 回傳影片</h3>
                  <span className="text-[10px] text-[var(--gray-500)]">1 支影片</span>
                </div>
                <div className="grid aspect-[9/16] w-full max-w-[400px] place-items-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--warm-white)]">
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

              <details className="rounded-lg border border-[var(--border)] bg-white p-2">
                <summary className="cursor-pointer text-xs text-[var(--gray-500)]">提示詞</summary>
                <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--warm-white)] p-2 text-[11px] leading-5 text-[var(--gray-500)]">{seedancePrompt}</pre>
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
      <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-[300px_minmax(0,1fr)] md:gap-3 md:p-4">
        <aside className="w-full space-y-3 md:sticky md:top-4 md:h-fit md:w-auto">
          <ProcessTimeline project={project} activeStep={activeStep} onSelectStep={setActiveStep} previewPanel={previewPanel} />
        </aside>

        <section className="min-w-0 space-y-2.5">
          <div className="rounded-xl border border-[var(--border)] bg-white p-3 shadow-[0_10px_30px_rgb(26_26_26/0.03)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-base tracking-normal text-[var(--black)] md:text-lg">{currentPanelTitle}</h1>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--gray-500)]">{currentPanelDescription}</p>
              </div>
              {activeStep === "project" ? (
                <button
                  className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-white px-4 text-sm text-[var(--gray-400)] transition hover:border-[var(--border-strong)] hover:bg-[var(--warm-white)] hover:text-[var(--gray-500)] disabled:opacity-60 lg:w-auto"
                  disabled={deletingProject}
                  onClick={() => setDeleteConfirmOpen(true)}
                  type="button"
                >
                  {deletingProject ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  刪除專案
                </button>
              ) : activeStep === 8 && videoControls ? (
                <div className="w-full shrink-0 lg:w-auto">{videoControls}</div>
              ) : typeof activeStep === "number" && (
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
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
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
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/20 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[0_22px_70px_rgb(26_26_26/0.18)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base text-[var(--black)]">刪除專案</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">確定要刪除「{project.title || "未命名專案"}」嗎？這個動作無法復原。</p>
              </div>
              <button className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--gray-400)] hover:bg-[var(--warm-white)] hover:text-[var(--gray-500)]" onClick={() => setDeleteConfirmOpen(false)} type="button">
                <X size={16} />
              </button>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="h-10 rounded-full border border-[var(--border)] bg-white px-4 text-sm text-[var(--gray-500)] hover:border-[var(--border-strong)] hover:bg-[var(--warm-white)] hover:text-[var(--gray-500)]"
                disabled={deletingProject}
                onClick={() => setDeleteConfirmOpen(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--warm-white)] px-4 text-sm text-[var(--gray-500)] hover:border-[var(--border-strong)] hover:bg-[var(--warm-white)] hover:text-[var(--gray-500)] disabled:opacity-60"
                disabled={deletingProject}
                onClick={deleteProject}
                type="button"
              >
                {deletingProject ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                確認刪除
              </button>
            </div>
          </div>
        </div>
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
  const [menuOpen, setMenuOpen] = useState(false);

  type MenuItem = { key: ActivePanel; label: string; Icon: typeof Link2; state?: StepState };
  const menuItems: MenuItem[] = [
    { key: "project", label: "專案資料", Icon: Link2 },
    ...steps.map((step, index) => ({
      key: (index + 1) as ActivePanel,
      label: `${index + 1}. ${step.title}`,
      Icon: STEP_META[(index + 1) as keyof typeof STEP_META].icon,
      state: step.state
    }))
  ];
  const activeItem = menuItems.find((item) => item.key === activeStep) ?? menuItems[0];

  const renderStatus = (item: MenuItem) => {
    if (item.key === "project") {
      return (
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-orange bg-orange text-white">
          <Link2 size={11} />
        </span>
      );
    }
    const isDone = item.state === "done";
    const isActive = item.state === "active";
    const isFailed = item.state === "failed";
    const Icon = item.Icon;
    return (
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
          isFailed
            ? "border-[var(--red)] bg-[var(--red-bg)] text-[var(--red)]"
            : isDone
              ? "border-orange bg-orange text-white"
              : isActive
                ? "border-orange bg-orange-bg text-orange"
                : "border-[var(--gray-200)] bg-white text-[var(--gray-300)]"
        }`}
      >
        {isActive ? <Loader2 size={11} className="animate-spin" /> : isFailed ? <X size={11} /> : isDone ? <Check size={11} /> : <Icon size={11} />}
      </span>
    );
  };

  return (
    <div className="process-card rounded-xl border border-[var(--border)] bg-white p-1.5">
      <div className="mb-1 flex items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-xs">功能選單</h2>
        </div>
      </div>
      {/* 手機版：下拉選單 */}
      <div className="relative md:hidden">
        <button
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border-strong)] bg-white px-2.5 py-2 text-left"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
        >
          <span className="flex min-w-0 items-center gap-2">
            {renderStatus(activeItem)}
            <span className="truncate text-sm text-[var(--black)]">{activeItem.label}</span>
          </span>
          <ChevronDown className={`shrink-0 text-[var(--gray-400)] transition-transform ${menuOpen ? "rotate-180" : ""}`} size={16} />
        </button>
        {menuOpen && (
          <>
            <button className="fixed inset-0 z-30 cursor-default" aria-label="關閉選單" onClick={() => setMenuOpen(false)} type="button" />
            <div className="absolute inset-x-0 z-40 mt-1 max-h-[60vh] space-y-0.5 overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-1 shadow-[0_18px_48px_rgb(26_26_26/0.12)]" role="listbox">
              {menuItems.map((item) => {
                const selected = item.key === activeStep;
                return (
                  <button
                    key={String(item.key)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left ${selected ? "bg-orange-bg text-orange" : "text-[var(--black)] hover:bg-[var(--warm-white)]"}`}
                    onClick={() => {
                      onSelectStep(item.key);
                      setMenuOpen(false);
                    }}
                    type="button"
                    role="option"
                    aria-selected={selected}
                  >
                    {renderStatus(item)}
                    <span className="truncate text-sm">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
      {/* 桌機版：側邊步驟列表 */}
      <div className="hidden md:block md:space-y-0.5">
        <div className="min-w-[220px] md:min-w-0">
          <div
            className={`process-step rounded-lg border px-2 py-1 ${
              activeStep === "project" ? "bg-orange-bg text-orange" : "text-[var(--black)] hover:bg-[var(--warm-white)]"
            } ${activeStep === "project" ? "border-[var(--orange-border)]" : "border-transparent"}`}
            data-active={activeStep === "project"}
          >
            <div className="flex min-w-0 items-center gap-1">
              <button className="process-tab flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 text-left" onClick={() => onSelectStep("project")} type="button">
                <span className="process-status grid h-5 w-5 shrink-0 place-items-center rounded-full border border-orange bg-orange text-white" title="專案資料">
                  <Link2 size={11} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs leading-4">專案資料</span>
                </span>
              </button>
              <button
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-orange hover:bg-white/70"
                onClick={() => setPreviewOpen((open) => !open)}
                title={previewOpen ? "收合影片預覽" : "展開影片預覽"}
                type="button"
              >
                <ChevronDown className={`transition-transform ${previewOpen ? "rotate-180" : ""}`} size={13} />
              </button>
            </div>
          </div>
          {previewOpen && <div className="mt-1.5 hidden md:block">{previewPanel}</div>}
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
                <div className={`px-1.5 pt-1 text-[10px] uppercase tracking-wide text-[var(--gray-500)] md:px-2 md:pt-1 ${stepNumber !== 1 ? "md:mt-0.5 md:border-t md:border-[var(--border)]" : ""}`}>
                  {sectionLabel}
                </div>
              )}
              <div
                className={`process-step min-w-[160px] rounded-lg border px-2 py-1 md:min-w-0 ${
                  selected
                    ? "bg-orange-bg text-orange"
                    : "text-[var(--black)] hover:bg-[var(--warm-white)]"
                } ${selected ? "border-[var(--orange-border)]" : "border-transparent"}`}
                data-active={selected}
                data-running={isActive}
              >
                <div className="flex items-start">
                  <button
                    className="process-tab flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 text-left"
                    onClick={() => onSelectStep(stepNumber as ActivePanel)}
                    type="button"
                  >
                    <span
                      className={`process-status grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
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
                      {isActive ? <Loader2 size={11} className="animate-spin" /> : isFailed ? <X size={11} /> : isDone ? <Check size={11} /> : <Icon size={11} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs leading-4">{stepNumber}. {step.title}</span>
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
    <div className={`rounded-lg border px-2.5 py-1.5 ${toneClass}`}>
      <span className="block text-[10px] opacity-75">{label}</span>
      <strong className="mt-0.5 block text-xs">{value}</strong>
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
