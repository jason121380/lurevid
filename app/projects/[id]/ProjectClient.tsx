"use client";

import { ArrowLeft, CheckCircle2, Download, Eye, Loader2, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Shell } from "@/components/Shell";

type Scene = {
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

type Project = {
  id: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  sourceTranscript?: string;
  analysis?: string;
  structure?: string;
  adaptedScript?: string;
  status: string;
  message: string;
  progress: number;
  finalVideoUrl?: string;
  error?: string;
  scenes: Scene[];
};

const BUSY = ["QUEUED", "ANALYZING", "STRUCTURING", "ADAPTING", "STORYBOARDING", "GENERATING", "MERGING"];
type StepState = "done" | "active" | "waiting" | "failed";

function stepStateClass(state: StepState) {
  if (state === "done") return "border-[var(--green)] bg-[var(--green-bg)] text-[var(--green)]";
  if (state === "active") return "border-orange bg-orange-bg text-orange";
  if (state === "failed") return "border-[var(--red)] bg-[var(--red-bg)] text-[var(--red)]";
  return "border-[var(--border-strong)] bg-white text-[var(--gray-300)]";
}

function buildProcessSteps(project: Project): Array<{ title: string; description: string; state: StepState }> {
  const failed = project.status === "FAILED";
  const doneAfterAnalyze = !["DRAFT", "QUEUED", "ANALYZING", "FAILED"].includes(project.status) || Boolean(project.analysis);
  const activeMessage = project.message || "";
  const step = (
    title: string,
    description: string,
    done: boolean,
    active: boolean
  ): { title: string; description: string; state: StepState } => {
    const state: StepState = failed && active ? "failed" : done ? "done" : active ? "active" : "waiting";
    return { title, description, state };
  };

  return [
    step("建立專案", "儲存來源連結並排入 Redis queue", project.progress >= 0.03, project.status === "QUEUED"),
    step("下載影片", "worker 用 yt-dlp 取得 IG/TikTok 影片", project.progress >= 0.1 || Boolean(project.sourceTranscript), project.status === "ANALYZING" && activeMessage.includes("下載")),
    step("轉錄音訊", "把影片聲音轉成逐字稿", Boolean(project.sourceTranscript), project.status === "ANALYZING" && (activeMessage.includes("轉錄") || activeMessage.includes("逐字稿") || activeMessage.includes("音訊"))),
    step("抽取影格", "用 ffmpeg 抽出代表性畫面", project.progress >= 0.17 || doneAfterAnalyze, project.status === "ANALYZING" && activeMessage.includes("抽取")),
    step("視覺分析", "AI 分析畫面、字幕、構圖與分鏡節奏", project.progress >= 0.19 || doneAfterAnalyze, project.status === "ANALYZING" && (activeMessage.includes("畫面") || activeMessage.includes("影格") || activeMessage.includes("分鏡"))),
    step("整合分析", "合併逐字稿與視覺分析產出洞察", doneAfterAnalyze, project.status === "ANALYZING" && activeMessage.includes("整合")),
    step("拆解結構", "拆 hook、鋪陳、賣點與 CTA", ["STRUCTURE_READY", "ADAPTING", "ADAPT_READY", "STORYBOARDING", "STORYBOARD_READY", "GENERATING", "MERGING", "COMPLETED"].includes(project.status), project.status === "STRUCTURING"),
    step("改編腳本", "改寫成全新原創短影音腳本", ["ADAPT_READY", "STORYBOARDING", "STORYBOARD_READY", "GENERATING", "MERGING", "COMPLETED"].includes(project.status), project.status === "ADAPTING"),
    step("產生分鏡", "拆 9 鏡並產生分鏡圖", ["STORYBOARD_READY", "GENERATING", "MERGING", "COMPLETED"].includes(project.status), project.status === "STORYBOARDING"),
    step("生成影片", "送 Seedance 產片段並合成 final.mp4", project.status === "COMPLETED", ["GENERATING", "MERGING"].includes(project.status))
  ];
}

function statusClass(status: string) {
  if (status === "COMPLETED" || status === "SUCCEEDED") return "badge-active";
  if (status === "FAILED") return "badge-error";
  return "badge-warn";
}

function sourceEmbedUrl(url?: string) {
  if (!url) return "";
  if (/instagram\.com\/(?:reels?|p)\//i.test(url)) {
    return `${url.split("?")[0].replace(/\/+$/, "").replace(/\/reels\//i, "/reel/")}/embed`;
  }
  return url;
}

export function ProjectClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [analysis, setAnalysis] = useState("");
  const [structure, setStructure] = useState("");
  const [script, setScript] = useState("");
  const [ratio, setRatio] = useState("9:16");
  const [resolution, setResolution] = useState("720p");
  const [duration, setDuration] = useState(5);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [activeStep, setActiveStep] = useState(1);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const settingsInit = useRef(false);
  const lastServer = useRef<{ analysis?: string; structure?: string; adaptedScript?: string }>({});

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        const data = await res.json();
        if (stopped) return;
        if (!res.ok) {
          setError(data.error || "讀取失敗");
          return;
        }
        setError("");
        // 只有當伺服器的值改變時才覆寫本地編輯，避免蓋掉使用者正在編輯的內容。
        if (data.analysis !== lastServer.current.analysis) setAnalysis(data.analysis || "");
        if (data.structure !== lastServer.current.structure) setStructure(data.structure || "");
        if (data.adaptedScript !== lastServer.current.adaptedScript) setScript(data.adaptedScript || "");
        lastServer.current = { analysis: data.analysis, structure: data.structure, adaptedScript: data.adaptedScript };
        if (!settingsInit.current) {
          if (data.ratio) setRatio(data.ratio);
          if (data.resolution) setResolution(data.resolution);
          if (data.duration) setDuration(data.duration);
          settingsInit.current = true;
        }

        setProject(data);
        if (!["COMPLETED", "FAILED"].includes(data.status)) setTimeout(load, 5000);
      } catch {
        if (stopped) return;
        setError("暫時讀不到專案資料，稍後會自動重試。");
        setTimeout(load, 5000);
      }
    }
    load();
    return () => {
      stopped = true;
    };
  }, [projectId]);

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setPreviewWidth(entry.contentRect.width);
    });
    observer.observe(element);
    setPreviewWidth(element.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, [project?.id]);

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
        return;
      }
      setProject(data);
    } catch {
      setError("API 沒有回應");
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !project) return <Shell><div className="p-6 text-[var(--red)]">{error}</div></Shell>;
  if (!project) return <Shell><div className="grid min-h-screen place-items-center"><Loader2 className="animate-spin text-orange" /></div></Shell>;

  const busy = BUSY.includes(project.status) || submitting;
  const disabled = busy;
  const previewScale = previewWidth ? previewWidth / 540 : 1;
  const statusPanel = (
    <div className="card p-3 md:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase text-orange">Source · {project.sourcePlatform || "影片"}</p>
          {project.sourceUrl && (
            <a className="mt-1 block break-all text-sm text-orange underline" href={project.sourceUrl} target="_blank" rel="noreferrer">
              {project.sourceUrl}
            </a>
          )}
        </div>
        {project.sourceUrl && (
          <a className="btn btn-ghost w-full shrink-0 sm:w-auto" href="#video-preview-modal" onClick={() => { window.location.hash = "video-preview-modal"; }}>
            <Eye size={16} />
            影片預覽
          </a>
        )}
      </div>
      <p className="mt-2 flex items-center gap-2 text-sm text-[var(--gray-500)]">
        {busy && <Loader2 size={14} className="animate-spin text-orange" />}
        {project.message}
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--border)]">
        <div className="h-full rounded-full bg-orange transition-all" style={{ width: `${Math.round(project.progress * 100)}%` }} />
      </div>
      {project.error && <p className="mt-3 rounded-lg bg-[var(--red-bg)] p-2 text-sm text-[var(--red)]">{project.error}</p>}
    </div>
  );
  const previewPanel = (
    <div className="card p-3 md:p-4">
      <div className="mb-3 flex items-center gap-2">
        {project.status === "COMPLETED" && <CheckCircle2 className="text-[var(--green)]" />}
        {project.status === "FAILED" && <XCircle className="text-[var(--red)]" />}
        <h2 className="text-lg">{project.finalVideoUrl ? "輸出影片" : "影片預覽"}</h2>
      </div>
      <div ref={previewRef} className="relative grid w-full aspect-[9/16] place-items-center overflow-hidden rounded-xl bg-[#111] text-sm text-white">
        {project.finalVideoUrl ? (
          <video src={project.finalVideoUrl} controls playsInline className="h-full w-full object-contain" />
        ) : project.sourceUrl ? (
          <iframe
            className="absolute left-0 top-0 border-0 bg-white"
            src={sourceEmbedUrl(project.sourceUrl)}
            style={{
              width: 540,
              height: 960,
              transform: `scale(${previewScale})`,
              transformOrigin: "top left"
            }}
            title="來源影片預覽"
            loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          />
        ) : (
          "尚未取得來源影片"
        )}
      </div>
      {!project.finalVideoUrl && project.sourceUrl && (
        <a className="btn btn-ghost mt-4 w-full" href={project.sourceUrl} target="_blank" rel="noreferrer">
          開啟原始影片
        </a>
      )}
      {project.finalVideoUrl && (
        <a className="btn btn-primary mt-4 w-full" href={project.finalVideoUrl} target="_blank" rel="noreferrer">
          <Download size={16} />
          下載完成影片
        </a>
      )}
    </div>
  );
  const transcriptPanel = (
    <div className="card p-3 md:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm">3 · 轉錄音訊</h2>
        <span className="text-[11px] text-[var(--gray-500)]">逐字稿</span>
      </div>
      {project.sourceTranscript ? (
        <div className="max-h-[560px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-white p-3 text-sm leading-7 md:p-4">
          {project.sourceTranscript}
        </div>
      ) : (
        <EmptyPanel title="尚未取得逐字稿" description="worker 會在下載影片後自動轉錄音訊。" />
      )}
    </div>
  );
  const storyboardPanel = (
    <div className="card p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm">9 · 產生分鏡</h2>
        {project.status === "STORYBOARD_READY" && (
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
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
            <select className="rounded-full border border-[var(--border-strong)] px-3 py-2 text-sm sm:py-1" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
              <option value={3}>每段 3 秒</option>
              <option value={4}>每段 4 秒</option>
              <option value={5}>每段 5 秒</option>
            </select>
            <button className="btn btn-primary w-full sm:w-auto" disabled={disabled} onClick={() => post("/video", { ratio, resolution, duration })}>
              變成影片
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
              <h3 className="text-sm">{scene.title}</h3>
              <div className="mt-3 grid aspect-video place-items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--warm-white)]">
                {scene.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scene.imageUrl} alt={scene.title} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-[var(--gray-500)]">分鏡圖生成中</span>
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
    if (activeStep === 1) return statusPanel;
    if (activeStep === 2) return previewPanel;
    if (activeStep === 3) return transcriptPanel;
    if ([4, 5, 6].includes(activeStep)) {
      return project.analysis ? (
        <ResultCard
          index="6"
          title="整合分析"
          value={analysis}
          actionLabel="確認分析 → 拆解結構"
          disabled={disabled}
          onAction={() => post("/structure", { analysis: project.analysis || analysis })}
        />
      ) : (
        <div className="card p-4"><EmptyPanel title="尚未完成分析" description="系統會先抽取影格、理解畫面，再整合逐字稿與視覺洞察。" /></div>
      );
    }
    if (activeStep === 7) {
      return project.structure ? (
        <StepCard
          index="7"
          title="拆解結構"
          value={structure}
          onChange={setStructure}
          actionLabel="確認結構 → 改編腳本"
          disabled={disabled}
          onAction={() => post("/adapt", { structure })}
        />
      ) : (
        <div className="card p-4"><EmptyPanel title="尚未拆解結構" description="確認分析後，會拆出 hook、鋪陳、賣點與 CTA。" /></div>
      );
    }
    if (activeStep === 8) {
      return project.adaptedScript ? (
        <StepCard
          index="8"
          title="改編腳本"
          value={script}
          onChange={setScript}
          actionLabel="確認腳本 → 產生分鏡圖"
          disabled={disabled}
          onAction={() => post("/storyboard", { adaptedScript: script })}
        />
      ) : (
        <div className="card p-4"><EmptyPanel title="尚未改編腳本" description="完成結構拆解後，會改寫成新的短影音腳本。" /></div>
      );
    }
    if (activeStep === 9) return storyboardPanel;
    return previewPanel;
  })();

  return (
    <Shell>
      <div className="min-h-screen bg-[var(--warm-white)]">
        <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-white px-3 py-3 md:px-6">
          <Link className="btn btn-ghost min-w-0" href="/">
            <ArrowLeft size={16} />
            <span className="truncate">返回新增專案</span>
          </Link>
          <span className={`badge ${statusClass(project.status)}`}>{project.status}</span>
        </div>

        <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-[300px_minmax(0,1fr)] md:gap-4 md:p-6">
          <aside className="h-fit md:sticky md:top-6">
            <ProcessTimeline project={project} activeStep={activeStep} onSelectStep={setActiveStep} />
          </aside>

          <section className="min-w-0">
            {selectedPanel}
          </section>
        </div>
        {project.sourceUrl && (
          <div id="video-preview-modal" className="fixed inset-0 z-50 hidden overflow-y-auto bg-black/45 px-4 py-8 target:grid target:items-start" role="dialog" aria-modal="true">
            <div className="mx-auto w-full max-w-[380px] rounded-2xl bg-white p-3 shadow-xl md:p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg">影片預覽</h2>
                <a className="grid h-9 w-9 place-items-center rounded-xl text-[var(--gray-500)] hover:bg-orange-bg hover:text-orange" href="#" title="關閉">
                  <X size={18} />
                </a>
              </div>
              <div className="relative grid max-h-[72vh] w-full aspect-[9/16] place-items-center overflow-hidden rounded-xl bg-[#111] text-sm text-white">
                <iframe
                  className="h-full w-full border-0 bg-white"
                  src={sourceEmbedUrl(project.sourceUrl)}
                  title="來源影片預覽"
                  loading="lazy"
                  allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                />
              </div>
              <a className="btn btn-ghost mt-4 w-full" href={project.sourceUrl} target="_blank" rel="noreferrer">
                開啟原始影片
              </a>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function ProcessTimeline({
  project,
  activeStep,
  onSelectStep
}: {
  project: Project;
  activeStep: number;
  onSelectStep: (step: number) => void;
}) {
  const steps = buildProcessSteps(project);

  return (
    <div className="card p-2.5 md:p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm">工作清單</h2>
        <span className="text-xs text-[var(--gray-500)]">{Math.round(project.progress * 100)}%</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 md:block md:space-y-1.5 md:overflow-visible md:pb-0">
        {steps.map((step, index) => (
          <div
            className={`flex min-w-[178px] items-center gap-1 rounded-lg border px-2.5 py-2 transition md:min-w-0 ${
              activeStep === index + 1
                ? "border-orange bg-orange-bg"
                : "border-[var(--border)] bg-white hover:border-orange/40 hover:bg-orange-bg/40"
            }`}
            key={step.title}
          >
            <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => onSelectStep(index + 1)} type="button">
              <div className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] ${stepStateClass(step.state)}`}>
                {step.state === "active" ? <Loader2 size={13} className="animate-spin" /> : step.state === "failed" ? <XCircle size={13} /> : index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium">{step.title}</div>
                <p className="mt-0.5 truncate text-[11px] leading-4 text-[var(--gray-500)]">{step.description}</p>
              </div>
            </button>
            {step.title === "下載影片" && project.sourceUrl && (
              <a
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--gray-500)] hover:bg-white hover:text-orange"
                href={project.sourceUrl}
                target="_blank"
                rel="noreferrer"
                title="開啟原始影片"
              >
                <Download size={14} />
              </a>
            )}
          </div>
        ))}
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
  const lines = value.split(/\r?\n/);

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

function ResultCard({
  index,
  title,
  value,
  actionLabel,
  onAction,
  disabled
}: {
  index: string;
  title: string;
  value: string;
  actionLabel: string;
  onAction: () => void;
  disabled: boolean;
}) {
  return (
    <div className="card p-3 md:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm">
          {index} · {title}
        </h2>
        <span className="text-[11px] text-[var(--gray-500)]">分析結果</span>
      </div>
      <MarkdownResult value={value} />
      <button className="btn btn-primary mt-3 w-full sm:w-auto" disabled={disabled || !value.trim()} onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}

function StepCard({
  index,
  title,
  value,
  onChange,
  actionLabel,
  onAction,
  disabled
}: {
  index: string;
  title: string;
  value: string;
  onChange: (value: string) => void;
  actionLabel: string;
  onAction: () => void;
  disabled: boolean;
}) {
  return (
    <div className="card p-3 md:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm">
          {index} · {title}
        </h2>
        <span className="text-[11px] text-[var(--gray-500)]">可編輯後再繼續</span>
      </div>
      <textarea
        className="min-h-[220px] w-full resize-y rounded-xl border border-[var(--border-strong)] bg-white p-3 text-sm leading-7 outline-none focus:border-orange md:min-h-[180px] md:p-4"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button className="btn btn-primary mt-3 w-full sm:w-auto" disabled={disabled || !value.trim()} onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}
