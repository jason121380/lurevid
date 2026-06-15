"use client";

import { Download, Loader2, Play, RotateCcw, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
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
  finalVideoUrl?: string;
  error?: string;
  steps?: Record<string, { status?: string; progress?: number; message?: string }>;
  scenes: Scene[];
};

const BUSY = ["QUEUED", "ANALYZING", "STRUCTURING", "ADAPTING", "STORYBOARDING", "GENERATING", "MERGING"];
type StepState = "done" | "active" | "waiting" | "failed";

function stepStateClass(state: StepState) {
  if (state === "done") return "border-orange bg-orange text-white";
  if (state === "active") return "border-orange bg-orange-bg text-orange";
  if (state === "failed") return "border-[var(--red)] bg-[var(--red-bg)] text-[var(--red)]";
  return "border-[var(--gray-200)] bg-white text-[var(--gray-300)]";
}

type StepInfo = { title: string; description: string; state: StepState; progress: number };

function buildProcessSteps(project: Project): StepInfo[] {
  const steps = (project.steps || {}) as Record<string, { status?: string; progress?: number }>;
  const storyboardDone = project.scenes.length === 9 && project.scenes.every((scene) => scene.imageUrl);

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
  // 步驟 5-8（再行銷）：用整體 status + 產物判斷。
  const phase = (done: boolean, active: boolean): StepState =>
    project.status === "FAILED" && active ? "failed" : done ? "done" : active ? "active" : "waiting";

  const mk = (title: string, description: string, state: StepState, progress?: number): StepInfo => ({
    title,
    description,
    state,
    progress: progress ?? (state === "done" ? 1 : state === "active" ? 0.5 : 0)
  });

  const s1 = sub("source", Boolean(project.sourceVideoUrl));
  const s2 = sub("transcribe", Boolean(project.sourceTranscript));
  const s3 = sub("frames", Boolean(project.sourceFrameUrls?.length));
  const s4 = sub("analyze", Boolean(project.analysis));

  return [
    mk("基本資料", "來源連結與下載 MP4", s1, subProgress("source", s1)),
    mk("轉錄音訊", "把影片聲音轉成逐字稿", s2, subProgress("transcribe", s2)),
    mk("抽取影格", "用 ffmpeg 抽出代表性畫面", s3, subProgress("frames", s3)),
    mk("影片分析", "整合畫面與逐字稿產出洞察", s4, subProgress("analyze", s4)),
    mk("結構分析", "拆 hook、鋪陳、賣點與 CTA", phase(Boolean(project.structure), project.status === "STRUCTURING")),
    mk("改編腳本", "改寫成全新原創短影音腳本", phase(Boolean(project.adaptedScript), project.status === "ADAPTING")),
    mk("產生分鏡", "拆 9 鏡並產生分鏡圖", phase(storyboardDone, project.status === "STORYBOARDING")),
    mk("生成影片", "送 Seedance 產片段並合成 final.mp4", phase(project.status === "COMPLETED" || Boolean(project.finalVideoUrl), ["GENERATING", "MERGING"].includes(project.status)))
  ];
}

function stepCanRun(project: Project, stepNumber: number) {
  if (stepNumber === 1) return Boolean(project.sourceUrl);
  if (stepNumber === 2) return Boolean(project.sourceUrl);
  if (stepNumber === 3) return Boolean(project.sourceUrl);
  if (stepNumber === 4) return Boolean(project.sourceTranscript);
  if (stepNumber === 5) return Boolean(project.analysis);
  if (stepNumber === 6) return Boolean(project.structure);
  if (stepNumber === 7) return Boolean(project.adaptedScript);
  if (stepNumber === 8) return project.status === "STORYBOARD_READY" && project.scenes.length === 9 && project.scenes.every((scene) => scene.imageUrl);
  return false;
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
    case "IMAGE_READY":
      return { pct: 50, color: "bg-orange" };
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

function statusClass(status: string) {
  if (status === "COMPLETED" || status === "SUCCEEDED") return "badge-active";
  if (status === "FAILED") return "badge-error";
  return "badge-warn";
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

  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    if (!/\/(?:reels?|p)\//i.test(parsed.pathname)) return "";
    const path = parsed.pathname.replace(/\/+$/, "").replace(/\/reels\//i, "/reel/");
    return `https://www.instagram.com${path}/embed`;
  }
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
  const [visualAnalysis, setVisualAnalysis] = useState(initialProject?.visualAnalysis || "");
  const [structure, setStructure] = useState(initialProject?.structure || "");
  const [script, setScript] = useState(initialProject?.adaptedScript || "");
  const [ratio, setRatio] = useState(initialProject?.ratio || "9:16");
  const [resolution, setResolution] = useState(initialProject?.resolution || "720p");
  const [duration, setDuration] = useState(initialProject?.duration || 5);
  const [activeStep, setActiveStep] = useState(1);
  const settingsInit = useRef(Boolean(initialProject));
  const lastServer = useRef<{ visualAnalysis?: string; analysis?: string; structure?: string; adaptedScript?: string }>({
    visualAnalysis: initialProject?.visualAnalysis,
    analysis: initialProject?.analysis,
    structure: initialProject?.structure,
    adaptedScript: initialProject?.adaptedScript
  });

  useEffect(() => {
    if (!initialProject) return;
    setProject(initialProject);
    setProjectTitle(initialProject.title || "");
    setVisualAnalysis(initialProject.visualAnalysis || "");
    setAnalysis(initialProject.analysis || "");
    setStructure(initialProject.structure || "");
    setScript(initialProject.adaptedScript || "");
    setRatio(initialProject.ratio || "9:16");
    setResolution(initialProject.resolution || "720p");
    setDuration(initialProject.duration || 5);
    lastServer.current = {
      visualAnalysis: initialProject.visualAnalysis,
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
        if (data.visualAnalysis !== lastServer.current.visualAnalysis) setVisualAnalysis(data.visualAnalysis || "");
        if (data.analysis !== lastServer.current.analysis) setAnalysis(data.analysis || "");
        if (data.structure !== lastServer.current.structure) setStructure(data.structure || "");
        if (data.adaptedScript !== lastServer.current.adaptedScript) setScript(data.adaptedScript || "");
        lastServer.current = { visualAnalysis: data.visualAnalysis, analysis: data.analysis, structure: data.structure, adaptedScript: data.adaptedScript };
        if (!settingsInit.current) {
          if (data.ratio) setRatio(data.ratio);
          if (data.resolution) setResolution(data.resolution);
          if (data.duration) setDuration(data.duration);
          settingsInit.current = true;
        }

        setProject(data);
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
  }, [projectId]);

  async function post(path: string, payload?: Record<string, unknown>, successMessage = "已送出") {
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
      toast(successMessage);
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
      toast("已儲存專案名稱");
    } catch {
      setError("API 沒有回應");
      toast("API 沒有回應", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function runStep(stepNumber: number) {
    if (!project) return;
    setActiveStep(stepNumber);
    if (stepNumber === 1) return void post("/source", undefined, "已開始重新下載來源");
    if (stepNumber === 2) return void post("/transcribe", undefined, "已開始轉錄");
    if (stepNumber === 3) return void post("/frames", undefined, "已開始抽取影格");
    if (stepNumber === 4) return void post("/analyze", undefined, "已開始影片分析");
    if (stepNumber === 5) return void post("/structure", { analysis: project.analysis || analysis }, "已開始結構分析");
    if (stepNumber === 6) return void post("/adapt", { structure }, "已開始改編腳本");
    if (stepNumber === 7) return void post("/storyboard", { adaptedScript: script }, "已開始產生分鏡");
    if (stepNumber === 8) return void post("/video", { ratio, resolution, duration }, "已開始生成影片");
  }

  if (error && !project) return <Shell><div className="p-6 text-[var(--red)]">{error}</div></Shell>;
  if (!project) return <Shell><div className="grid min-h-screen place-items-center"><Loader2 className="animate-spin text-orange" /></div></Shell>;

  const busy = BUSY.includes(project.status) || submitting;
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
    <div className="rounded-xl bg-white p-3 text-sm md:p-4">
      <p className="mb-2 text-[11px] uppercase text-orange">專案命名</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="min-w-0 flex-1 rounded-full border border-[var(--border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-orange"
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
  const sourcePanel = (
    <div className="space-y-3">
      {namePanel}
      <div className="rounded-xl bg-white p-3 text-sm md:p-4">
        <p className="text-[11px] text-orange">來源 · {project.sourcePlatform || "影片"}</p>
        {project.sourceUrl && (
          <a className="mt-1 block break-all text-xs text-orange underline" href={project.sourceUrl} target="_blank" rel="noreferrer">
            {project.sourceUrl}
          </a>
        )}
        <p className="mt-2 flex items-center gap-2 text-xs text-[var(--gray-500)]">
          {busy && <Loader2 size={13} className="animate-spin text-orange" />}
          {project.message}
        </p>
        {project.error && <p className="mt-3 rounded-lg bg-[var(--red-bg)] p-2 text-xs text-[var(--red)]">{project.error}</p>}
      </div>
      <div className="rounded-xl bg-white p-3 md:p-4">
        {downloadButton}
        {!project.sourceVideoUrl && (project.analysis || project.sourceTranscript) && (
          <p className="mt-2 text-xs leading-5 text-[var(--gray-500)]">影片下載失敗，但已用可取得的音訊/內容完成後續分析。若需要 MP4，請重跑「基本資料」或換一支公開影片。</p>
        )}
      </div>
    </div>
  );
  const previewPanel = (
    <div className="w-full max-w-[325px] justify-self-center md:justify-self-start">
      <div className="grid aspect-[9/16] w-full place-items-center overflow-hidden rounded-xl bg-transparent text-sm text-[var(--gray-500)]">
        <div className="relative h-full w-full overflow-hidden bg-transparent">
          {project.finalVideoUrl ? (
            <video src={project.finalVideoUrl} controls playsInline className="h-full w-full object-contain" />
          ) : project.sourceUrl ? (
            <iframe
              className="h-full w-full border-0 bg-transparent"
              src={sourceEmbedUrl(project.sourceUrl)}
              title="來源影片預覽"
              loading="lazy"
              allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
            />
          ) : (
            "尚未取得來源影片"
          )}
        </div>
      </div>
    </div>
  );
  const transcriptPanel = (
    <div className="card p-3 md:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold">2 · 轉錄音訊</h2>
        <span className="text-[11px] text-[var(--gray-500)]">逐字稿</span>
      </div>
      {project.sourceTranscript ? (
        <TranscriptResult value={project.sourceTranscript} />
      ) : (
        <EmptyPanel title="尚未取得逐字稿" description="worker 會在下載影片後自動轉錄音訊。" />
      )}
    </div>
  );
  const framePanel = (
    <div className="card p-3 md:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold">3 · 抽取影格</h2>
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
        <h2 className="text-sm font-bold">{activeStep === 8 ? "8 · 生成影片" : "7 · 產生分鏡"}</h2>
        {project.status === "STORYBOARD_READY" && (
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <select className="rounded-full border border-[var(--border-strong)] px-3 py-2 text-sm sm:py-1" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
              <option value={3}>每段 3 秒</option>
              <option value={4}>每段 4 秒</option>
              <option value={5}>每段 5 秒</option>
            </select>
            <select className="rounded-full border border-[var(--border-strong)] px-3 py-2 text-sm sm:py-1" value={ratio} onChange={(event) => setRatio(event.target.value)}>
              <option>9:16</option>
              <option>16:9</option>
              <option>1:1</option>
            </select>
            <select className="rounded-full border border-[var(--border-strong)] px-3 py-2 text-sm sm:py-1" value={resolution} onChange={(event) => setResolution(event.target.value)}>
              <option>720p</option>
              <option>1080p</option>
              <option>480p</option>
            </select>
            <button
              className="btn btn-primary"
              disabled={busy || submitting}
              onClick={() => post("/video", { ratio, resolution, duration }, "已開始生成影片")}
              type="button"
            >
              <Play size={14} />
              生成影片
            </button>
          </div>
        )}
      </div>
      {project.scenes.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {project.scenes.map((scene) => (
            <article key={scene.id} className="card p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-orange">{String(scene.sceneNumber).padStart(2, "0")}</span>
                <span className={`badge ${statusClass(scene.status)}`}>{scene.status}</span>
              </div>
              <div className="mb-2 h-0.5 w-full overflow-hidden rounded-full bg-[var(--gray-200)]">
                <div className={`h-full transition-all duration-500 ${sceneProgress(scene.status).color}`} style={{ width: `${sceneProgress(scene.status).pct}%` }} />
              </div>
              <h3 className="text-sm font-bold">{scene.title}</h3>
              <div className="mt-3 grid aspect-[9/16] place-items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--warm-white)]">
                {scene.videoUrl ? (
                  <video src={scene.videoUrl} className="h-full w-full object-cover" muted loop autoPlay playsInline />
                ) : scene.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scene.imageUrl} alt={scene.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 size={22} className="animate-spin text-orange" />
                    <span className="text-sm tabular-nums font-medium text-orange">{sceneProgress(scene.status).pct}%</span>
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
  const selectedPanel = (() => {
    if (activeStep === 1) return sourcePanel;
    if (activeStep === 2) return transcriptPanel;
    if (activeStep === 3) return framePanel;
    if (activeStep === 4) {
      return project.analysis ? (
        <ResultCard index="4" title="影片分析" value={analysis} />
      ) : (
        <div className="card p-4"><EmptyPanel title="尚未完成影片分析" description="完成轉錄與抽取影格後，會整合畫面與逐字稿產出洞察。" /></div>
      );
    }
    if (activeStep === 5) {
      return project.structure ? (
        <ResultCard index="5" title="結構分析" value={structure} />
      ) : (
        <div className="card p-4"><EmptyPanel title="尚未結構分析" description="確認分析後，會拆出 hook、鋪陳、賣點與 CTA。" /></div>
      );
    }
    if (activeStep === 6) {
      return project.adaptedScript ? (
        <StepCard index="6" title="改編腳本" value={script} onChange={setScript} />
      ) : (
        <div className="card p-4"><EmptyPanel title="尚未改編腳本" description="完成結構拆解後，會改寫成新的短影音腳本。" /></div>
      );
    }
    if (activeStep === 7 || activeStep === 8) return storyboardPanel;
    return sourcePanel;
  })();

  return (
    <Shell>
      <div className="min-h-screen bg-[var(--warm-white)]">
        <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-[150px_minmax(0,1fr)_360px] md:gap-4 md:p-6">
          <aside className="h-fit md:sticky md:top-6">
            <ProcessTimeline project={project} activeStep={activeStep} busy={busy} onSelectStep={setActiveStep} onRunStep={runStep} />
          </aside>

          <section className="min-w-0">
            {selectedPanel}
          </section>

          <aside className="min-w-0 md:sticky md:top-6 md:h-fit">
            {previewPanel}
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function ProcessTimeline({
  project,
  activeStep,
  busy,
  onSelectStep,
  onRunStep
}: {
  project: Project;
  activeStep: number;
  busy: boolean;
  onSelectStep: (step: number) => void;
  onRunStep: (step: number) => void;
}) {
  const steps = buildProcessSteps(project);

  return (
    <div className="rounded-xl bg-white p-2 md:p-3">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-bold">功能選單</h2>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 md:block md:space-y-0.5 md:overflow-visible md:pb-0">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const canRun = stepCanRun(project, stepNumber) && !busy;
          const isDone = step.state === "done";
          const isActive = step.state === "active";
          const isFailed = step.state === "failed";
          const sectionLabel = stepNumber === 1 ? "分析" : stepNumber === 6 ? "再行銷" : null;
          const barColor = isFailed ? "bg-[var(--red)]" : "bg-orange";
          const barPct = Math.round(Math.max(0, Math.min(1, step.progress)) * 100);

          return (
            <div className="contents" key={step.title}>
              {sectionLabel && (
                <div className={`px-2 pt-2 text-[11px] uppercase tracking-wide text-[var(--gray-500)] ${stepNumber === 6 ? "md:mt-1 md:border-t md:border-[var(--border)]" : ""}`}>
                  {sectionLabel}
                </div>
              )}
              <div
                className={`min-w-[150px] rounded-lg px-2 py-1.5 transition md:min-w-0 ${
                  activeStep === stepNumber
                    ? "bg-orange-bg text-orange"
                    : "text-[var(--black)] hover:bg-[var(--warm-white)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* 數字圈：只當狀態指示與選取，不再是執行按鈕 */}
                  <button
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] ${stepStateClass(step.state)}`}
                    onClick={() => onSelectStep(stepNumber)}
                    type="button"
                  >
                    {isActive ? <Loader2 size={13} className="animate-spin" /> : isFailed ? <XCircle size={13} /> : stepNumber}
                  </button>
                  <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => onSelectStep(stepNumber)} type="button">
                    <div className="truncate text-xs font-medium leading-6">{step.title}</div>
                  </button>
                  {isActive && <span className="shrink-0 text-[11px] tabular-nums text-orange">{barPct}%</span>}
                  {/* 執行/重跑按鈕：單獨放右邊 */}
                  <button
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border transition ${canRun ? "border-[var(--border-strong)] text-orange hover:bg-orange hover:text-white" : "border-[var(--border)] text-[var(--gray-300)]"}`}
                    disabled={!canRun}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRunStep(stepNumber);
                    }}
                    title={canRun ? (isDone || isFailed ? "重新執行" : "開始執行") : "尚不能執行"}
                    type="button"
                  >
                    {isActive ? <Loader2 size={13} className="animate-spin" /> : isDone || isFailed ? <RotateCcw size={12} /> : <Play size={11} fill="currentColor" />}
                  </button>
                </div>
                <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-[var(--gray-200)]">
                  <div className={`h-full transition-all duration-500 ${barColor}`} style={{ width: `${barPct}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-xl border border-dashed border-[var(--border-strong)] bg-white p-4 text-center md:min-h-[260px] md:p-6">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-[var(--gray-500)]">{description}</p>
      </div>
    </div>
  );
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong className="font-bold text-[var(--black)]" key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    return part;
  });
}

function MarkdownResult({ value }: { value: string }) {
  const lines = useMemo(() => value.split(/\r?\n/), [value]);

  return (
    <div className="max-h-[60vh] overflow-y-auto px-1 py-1 text-sm leading-7 md:max-h-[560px]">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div className="h-3" key={index} />;
        if (/^-{3,}$/.test(trimmed)) return <div className="my-4 h-px bg-[var(--border)]" key={index} />;

        const heading = trimmed.match(/^#{1,4}\s*(.+)$/);
        if (heading) {
          return (
            <h3 className="mt-4 text-base font-bold text-[var(--black)] first:mt-0" key={index}>
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
    <div className="max-h-[560px] overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-2 text-sm md:p-3">
      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 border-b border-[var(--border)] px-2 pb-2 text-xs font-semibold text-[var(--gray-500)] sm:grid-cols-[112px_minmax(0,1fr)]">
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

function ResultCard({
  index,
  title,
  value
}: {
  index: string;
  title: string;
  value: string;
}) {
  return (
    <div className="card p-3 md:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold">
          {index} · {title}
        </h2>
        <span className="text-[11px] text-[var(--gray-500)]">分析結果</span>
      </div>
      <MarkdownResult value={value} />
    </div>
  );
}

function StepCard({
  index,
  title,
  value,
  onChange
}: {
  index: string;
  title: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="card p-3 md:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold">
          {index} · {title}
        </h2>
        <span className="text-[11px] text-[var(--gray-500)]">可編輯後再繼續</span>
      </div>
      <textarea
        className="min-h-[220px] w-full resize-y rounded-xl border border-[var(--border-strong)] bg-white p-3 text-sm leading-7 outline-none focus:border-orange md:min-h-[180px] md:p-4"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
