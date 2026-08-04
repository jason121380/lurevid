"use client";

import { Check, Download, Loader2, Play, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { TopAppBar } from "@/components/ui/TopAppBar";

export type GenerationKind = "IMAGE" | "VIDEO";

export type Generation = {
  id: string;
  kind: GenerationKind;
  prompt: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  ratio: string;
  duration: number;
  resultUrl?: string | null;
  error?: string | null;
  createdAt: string;
};

const RATIOS: Array<{ value: string; label: string }> = [
  { value: "9:16", label: "直式 9:16" },
  { value: "1:1", label: "方形 1:1" },
  { value: "16:9", label: "橫式 16:9" }
];

const ASPECT: Record<string, string> = {
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
  "16:9": "aspect-video"
};

const RUNNING = ["QUEUED", "RUNNING"];

function statusLabel(generation: Generation) {
  if (generation.status === "QUEUED") return "排隊中";
  if (generation.status === "RUNNING") return generation.kind === "VIDEO" ? "生成影片中" : "生成圖片中";
  if (generation.status === "FAILED") return "失敗";
  return "完成";
}

export function QuickStudio({
  kind,
  title,
  description,
  placeholder
}: {
  kind: GenerationKind;
  title: string;
  description: string;
  placeholder: string;
}) {
  const toast = useToast();
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState("9:16");
  const [duration, setDuration] = useState(8);
  const [items, setItems] = useState<Generation[]>([]);
  const [model, setModel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  // 補完前的原文，讓使用者可以一鍵還原（AI 補完不該是不可逆的）。
  const [beforeEnhance, setBeforeEnhance] = useState<string | null>(null);
  const [error, setError] = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/quick/config")
      .then((res) => res.json())
      .then((data) => setModel(kind === "IMAGE" ? data.imageModel : data.videoModel))
      .catch(() => undefined);
  }, [kind]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/quick/generations?kind=${kind}`);
      const data = await res.json();
      if (res.ok) setItems(data.generations || []);
    } catch {
      /* 輪詢失敗不打擾使用者，下一輪會再試 */
    }
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  // 只有還在跑的時候才輪詢，全部完成就停下來。
  useEffect(() => {
    if (!items.some((item) => RUNNING.includes(item.status))) return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [items, load]);

  async function enhance() {
    const value = prompt.trim();
    if (!value || enhancing) return;
    setEnhancing(true);
    setError("");
    try {
      const res = await fetch("/api/quick/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, prompt: value })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "提示詞補完失敗");
        toast(data.error || "提示詞補完失敗", "error");
        return;
      }
      setBeforeEnhance(value);
      setPrompt(data.prompt);
      toast("已補完提示詞，確認後再送出");
      promptRef.current?.focus();
    } catch {
      setError("API 沒有回應");
      toast("API 沒有回應", "error");
    } finally {
      setEnhancing(false);
    }
  }

  async function submit() {
    const value = prompt.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/quick/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, prompt: value, ratio, duration })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "送出失敗");
        toast(data.error || "送出失敗", "error");
        return;
      }
      // 立刻插到最前面，使用者可以馬上再送下一組。
      setItems((current) => [data.generation, ...current]);
      setPrompt("");
      setBeforeEnhance(null);
      toast("已送出，生成中");
    } catch {
      setError("API 沒有回應");
      toast("API 沒有回應", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    const previous = items;
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      const res = await fetch(`/api/quick/generations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setItems(previous);
        toast("刪除失敗", "error");
      }
    } catch {
      setItems(previous);
      toast("刪除失敗", "error");
    }
  }

  const runningCount = items.filter((item) => RUNNING.includes(item.status)).length;

  return (
    <div className="min-h-dvh bg-[var(--warm-white)]">
      <TopAppBar
        title={title}
        align="left"
        right={model ? <span className="badge badge-warn font-normal">{model}</span> : null}
      />

      <div className="mx-auto max-w-content px-4 py-4 lg:mx-0 lg:max-w-content-wide lg:px-8 lg:py-6">
        <p className="mb-3 text-[13px] leading-6 text-[var(--gray-500)]">{description}</p>

        <div className="surface p-3 md:p-4">
          <div className="relative">
            <textarea
              ref={promptRef}
              className="field min-h-[104px] resize-y pr-12"
              placeholder={placeholder}
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                if (error) setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
              }}
            />
            <button
              className="absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full text-orange transition hover:bg-orange-bg disabled:cursor-not-allowed disabled:text-[var(--gray-300)]"
              disabled={!prompt.trim() || enhancing || submitting}
              onClick={enhance}
              title="用 AI 幫我補完提示詞"
              type="button"
            >
              {enhancing ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
            </button>
          </div>

          {beforeEnhance !== null && (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-orange-bg px-3 py-2 text-[12px] text-orange">
              <span className="flex items-center gap-1.5">
                <Check size={13} /> 已補完，確認後再送出
              </span>
              <button
                className="flex shrink-0 items-center gap-1 font-medium underline"
                onClick={() => {
                  setPrompt(beforeEnhance);
                  setBeforeEnhance(null);
                }}
                type="button"
              >
                <Undo2 size={13} /> 還原
              </button>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select className="h-9 rounded-full border border-[var(--border-strong)] bg-white px-3 text-[13px]" value={ratio} onChange={(event) => setRatio(event.target.value)}>
              {RATIOS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {kind === "VIDEO" && (
              <select className="h-9 rounded-full border border-[var(--border-strong)] bg-white px-3 text-[13px]" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                <option value={8}>8 秒</option>
                <option value={15}>15 秒</option>
              </select>
            )}

            <div className="flex-1" />

            <button className="btn btn-primary" disabled={!prompt.trim() || submitting} onClick={submit} type="button">
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
              送出生成
            </button>
          </div>

          {error && (
            <p className="mt-2 rounded-md bg-[var(--red-bg)] px-3 py-2 text-[12px] leading-5 text-[var(--red)]" role="alert">
              {error}
            </p>
          )}
          <p className="mt-2 text-[12px] text-[var(--gray-400)]">
            送出後可以直接再輸入下一組，不用等前一組完成。
            {runningCount > 0 && <span className="text-orange">　目前 {runningCount} 組進行中</span>}
          </p>
        </div>

        <div className="mt-5">
          {items.length === 0 ? (
            <div className="card grid place-items-center px-6 py-14 text-center">
              <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-orange-bg text-orange">
                <Sparkles size={20} />
              </span>
              <p className="text-[15px] text-[var(--black)]">還沒有生成紀錄</p>
              <p className="mt-1 text-[13px] leading-6 text-[var(--gray-500)]">在上面輸入想法，按 ✨ 讓 AI 補完，確認後送出。</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {items.map((item) => (
                <GenerationCard key={item.id} generation={item} onRemove={() => remove(item.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GenerationCard({ generation, onRemove }: { generation: Generation; onRemove: () => void }) {
  const running = RUNNING.includes(generation.status);
  const aspect = ASPECT[generation.ratio] || ASPECT["9:16"];

  return (
    <article className="card overflow-hidden">
      <div className={`relative grid ${aspect} place-items-center bg-[var(--warm-white)]`}>
        {generation.status === "SUCCEEDED" && generation.resultUrl ? (
          generation.kind === "VIDEO" ? (
            <video className="h-full w-full object-contain" src={generation.resultUrl} controls playsInline />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="h-full w-full object-cover" src={generation.resultUrl} alt={generation.prompt.slice(0, 40)} />
          )
        ) : generation.status === "FAILED" ? (
          <div className="px-4 text-center">
            <span className="mx-auto mb-2 grid h-9 w-9 place-items-center rounded-full bg-[var(--red-bg)] text-[var(--red)]">
              <X size={17} />
            </span>
            <p className="text-[12px] leading-5 text-[var(--red)]">{generation.error || "生成失敗"}</p>
          </div>
        ) : (
          <div className="text-center">
            <Loader2 className="mx-auto mb-2 animate-spin text-orange" size={22} />
            <p className="text-[12px] text-[var(--gray-500)]">{statusLabel(generation)}</p>
          </div>
        )}
      </div>

      <div className="p-3">
        <p className="line-clamp-3 text-[12px] leading-5 text-[var(--gray-600)]" title={generation.prompt}>
          {generation.prompt}
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <span className={`badge ${generation.status === "SUCCEEDED" ? "badge-active" : generation.status === "FAILED" ? "badge-error" : "badge-warn"}`}>
            {running && <Loader2 size={10} className="animate-spin" />}
            {statusLabel(generation)}
          </span>
          <span className="text-[11px] text-[var(--gray-400)]">
            {generation.ratio}
            {generation.kind === "VIDEO" && generation.duration ? ` · ${generation.duration}秒` : ""}
          </span>

          <div className="flex-1" />

          {generation.status === "SUCCEEDED" && generation.resultUrl && (
            <a
              className="grid h-8 w-8 place-items-center rounded-full text-[var(--gray-500)] transition hover:bg-[var(--surface-muted)] hover:text-orange"
              href={generation.resultUrl}
              download
              target="_blank"
              rel="noreferrer"
              title="下載"
            >
              <Download size={15} />
            </a>
          )}
          <button
            className="grid h-8 w-8 place-items-center rounded-full text-[var(--gray-400)] transition hover:bg-[var(--red-bg)] hover:text-[var(--red)] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={running}
            onClick={onRemove}
            title={running ? "生成中無法刪除" : "刪除"}
            type="button"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}
