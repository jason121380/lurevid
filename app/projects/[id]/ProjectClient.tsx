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

function statusClass(status: string) {
  if (status === "COMPLETED" || status === "SUCCEEDED") return "badge-active";
  if (status === "FAILED") return "badge-error";
  return "badge-warn";
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

  return (
    <Shell>
      <div className="min-h-screen bg-[var(--warm-white)]">
        <div className="flex h-[60px] items-center justify-between border-b border-[var(--border)] bg-white px-6">
          <Link className="btn btn-ghost" href="/">
            <ArrowLeft size={16} />
            返回工作台
          </Link>
          <span className={`badge ${statusClass(project.status)}`}>{project.status}</span>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:p-6">
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
              <StepCard
                index="1"
                title="分析"
                value={analysis}
                onChange={setAnalysis}
                actionLabel="確認分析 → 拆解結構"
                disabled={disabled}
                onAction={() => post("/structure", { analysis })}
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

          <aside className="card h-fit p-4 lg:sticky lg:top-6">
            <div className="mb-3 flex items-center gap-2">
              {project.status === "COMPLETED" ? <CheckCircle2 className="text-[var(--green)]" /> : project.status === "FAILED" ? <XCircle className="text-[var(--red)]" /> : <Loader2 className="animate-spin text-orange" />}
              <h2 className="text-lg">輸出影片</h2>
            </div>
            <div className="grid aspect-[9/16] max-h-[420px] place-items-center overflow-hidden rounded-xl bg-[#111] text-sm text-white">
              {project.finalVideoUrl ? (
                <video src={project.finalVideoUrl} controls playsInline className="h-full w-full object-contain" />
              ) : project.status === "STORYBOARD_READY" ? (
                "分鏡圖已完成，按「變成影片」"
              ) : (
                "處理中"
              )}
            </div>
            {project.finalVideoUrl && (
              <a className="btn btn-primary mt-4 w-full" href={project.finalVideoUrl} target="_blank" rel="noreferrer">
                <Download size={16} />
                下載完成影片
              </a>
            )}
          </aside>
        </div>
      </div>
    </Shell>
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
