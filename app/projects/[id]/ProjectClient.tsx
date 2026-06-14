"use client";

import { ArrowLeft, CheckCircle2, Download, Loader2, XCircle } from "lucide-react";
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
  if (/instagram\.com\/(?:reel|p)\//i.test(url)) return `${url.split("?")[0].replace(/\/+$/, "")}/embed`;
  return url;
}

export function ProjectClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [analysis, setAnalysis] = useState("");
  const [structure, setStructure] = useState("");
  const [script, setScript] = useState("");
  const [transcript, setTranscript] = useState("");
  const [ratio, setRatio] = useState("9:16");
  const [resolution, setResolution] = useState("720p");
  const [duration, setDuration] = useState(5);
  const [previewWidth, setPreviewWidth] = useState(0);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const settingsInit = useRef(false);
  const lastServer = useRef<{ analysis?: string; structure?: string; adaptedScript?: string }>({});

  useEffect(() => {
    let stopped = false;
    async function load() {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      if (stopped) return;
      if (!res.ok) {
        setError(data.error || "讀取失敗");
        return;
      }
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

  return (
    <Shell>
      <div className="min-h-screen bg-[var(--warm-white)]">
        <div className="flex h-[60px] items-center justify-between border-b border-[var(--border)] bg-white px-6">
          <Link className="btn btn-ghost" href="/">
            <ArrowLeft size={16} />
            返回新增專案
          </Link>
          <span className={`badge ${statusClass(project.status)}`}>{project.status}</span>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_420px] gap-4 p-6">
          <section className="space-y-4">
            <div className="card p-4">
              <p className="text-[11px] uppercase text-orange">Source · {project.sourcePlatform || "影片"}</p>
              {project.sourceUrl && (
                <a className="mt-1 block break-all text-sm text-orange underline" href={project.sourceUrl} target="_blank" rel="noreferrer">
                  {project.sourceUrl}
                </a>
              )}
              <p className="mt-2 flex items-center gap-2 text-sm text-[var(--gray-500)]">
                {busy && <Loader2 size={14} className="animate-spin text-orange" />}
                {project.message}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--border)]">
                <div className="h-full rounded-full bg-orange transition-all" style={{ width: `${Math.round(project.progress * 100)}%` }} />
              </div>
              {project.error && <p className="mt-3 rounded-lg bg-[var(--red-bg)] p-2 text-sm text-[var(--red)]">{project.error}</p>}

              {project.status === "FAILED" && (
                <div className="mt-3 space-y-2 rounded-xl bg-[var(--warm-white)] p-3">
                  <p className="text-xs text-[var(--gray-500)]">抓不到影片時，可手動貼上逐字稿重新分析：</p>
                  <textarea
                    className="min-h-[100px] w-full resize-y rounded-lg border border-[var(--border-strong)] bg-white p-3 text-sm outline-none focus:border-orange"
                    placeholder="貼上影片字幕／逐字稿"
                    value={transcript}
                    onChange={(event) => setTranscript(event.target.value)}
                  />
                  <button className="btn btn-primary" disabled={submitting} onClick={() => post("/analyze", { transcript })}>
                    用這份逐字稿重新分析
                  </button>
                </div>
              )}
            </div>

            {project.analysis != null && project.analysis !== "" && (
              <ResultCard
                index="1"
                title="影片分析"
                value={analysis}
                actionLabel="確認分析 → 拆解結構"
                disabled={disabled}
                onAction={() => post("/structure", { analysis: project.analysis || analysis })}
              />
            )}

            {project.structure != null && project.structure !== "" && (
              <StepCard
                index="2"
                title="分析結構"
                value={structure}
                onChange={setStructure}
                actionLabel="確認結構 → 改編腳本"
                disabled={disabled}
                onAction={() => post("/adapt", { structure })}
              />
            )}

            {project.adaptedScript != null && project.adaptedScript !== "" && (
              <StepCard
                index="3"
                title="改編腳本"
                value={script}
                onChange={setScript}
                actionLabel="確認腳本 → 產生分鏡圖"
                disabled={disabled}
                onAction={() => post("/storyboard", { adaptedScript: script })}
              />
            )}

            {project.scenes.length > 0 && (
              <div className="card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm">4 · 分鏡圖</h2>
                  {project.status === "STORYBOARD_READY" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <select className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-sm" value={ratio} onChange={(event) => setRatio(event.target.value)}>
                        <option>9:16</option>
                        <option>16:9</option>
                        <option>1:1</option>
                      </select>
                      <select className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-sm" value={resolution} onChange={(event) => setResolution(event.target.value)}>
                        <option>720p</option>
                        <option>1080p</option>
                        <option>480p</option>
                      </select>
                      <select className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-sm" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                        <option value={3}>每段 3 秒</option>
                        <option value={4}>每段 4 秒</option>
                        <option value={5}>每段 5 秒</option>
                      </select>
                      <button className="btn btn-primary" disabled={disabled} onClick={() => post("/video", { ratio, resolution, duration })}>
                        變成影片
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid gap-3 xl:grid-cols-3">
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
              </div>
            )}
          </section>

          <aside className="sticky top-6 h-fit space-y-4">
            <div className="card p-4">
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
            <ProcessTimeline project={project} />
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function ProcessTimeline({ project }: { project: Project }) {
  const steps = buildProcessSteps(project);

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm">背後處理流程</h2>
        <span className="text-xs text-[var(--gray-500)]">{Math.round(project.progress * 100)}%</span>
      </div>
      <div className="space-y-2">
        {steps.map((step, index) => (
          <div className="flex gap-3 rounded-xl border border-[var(--border)] bg-white p-3" key={step.title}>
            <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs ${stepStateClass(step.state)}`}>
              {step.state === "active" ? <Loader2 size={15} className="animate-spin" /> : step.state === "failed" ? <XCircle size={15} /> : index + 1}
            </div>
            <div className="min-w-0">
              <div className="text-sm">{step.title}</div>
              <p className="mt-1 text-xs leading-5 text-[var(--gray-500)]">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong className="font-semibold text-[var(--black)]" key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    return part;
  });
}

function MarkdownResult({ value }: { value: string }) {
  const lines = value.split(/\r?\n/);

  return (
    <div className="max-h-[560px] overflow-y-auto px-1 py-1 text-sm leading-7">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div className="h-3" key={index} />;
        if (/^-{3,}$/.test(trimmed)) return <div className="my-4 h-px bg-[var(--border)]" key={index} />;

        const heading = trimmed.match(/^#{1,4}\s*(.+)$/);
        if (heading) {
          return (
            <h3 className="mt-4 text-base font-semibold text-[var(--black)] first:mt-0" key={index}>
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
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm">
          {index} · {title}
        </h2>
        <span className="text-[11px] text-[var(--gray-500)]">分析結果</span>
      </div>
      <MarkdownResult value={value} />
      <button className="btn btn-primary mt-3" disabled={disabled || !value.trim()} onClick={onAction}>
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
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm">
          {index} · {title}
        </h2>
        <span className="text-[11px] text-[var(--gray-500)]">可編輯後再繼續</span>
      </div>
      <textarea
        className="min-h-[180px] w-full resize-y rounded-xl border border-[var(--border-strong)] bg-white p-4 text-sm leading-7 outline-none focus:border-orange"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button className="btn btn-primary mt-3" disabled={disabled || !value.trim()} onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}
