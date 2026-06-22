"use client";

import { Loader2, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { TopAppBar } from "@/components/ui/TopAppBar";

type UsageData = {
  generatedAt: string;
  note: string;
  totals: {
    projects: number;
    completedProjects: number;
    estimatedCostUsd: number;
  };
  openai: {
    jobs: {
      transcribe: number;
      analysis: number;
      adapt: number;
      storyboardPrompts: number;
      storyboardImages: number;
    };
    usage: {
      textInputTokens: number;
      textOutputTokens: number;
      transcribeMinutes: number;
      imageInputTokens: number;
      imageOutputTokens: number;
    };
    estimatedCostUsd: number;
    breakdown: {
      textUsd: number;
      transcribeUsd: number;
      imageUsd: number;
    };
  };
  seedance: {
    jobs: {
      completedVideos: number;
    };
    usage: {
      outputSeconds: number;
    };
    estimatedCostUsd: number;
  };
  pricing: {
    openai: {
      text: string;
      image: string;
      transcribe: string;
    };
    seedance: string;
  };
};

const USD_TO_TWD = 31.57;

function twd(valueUsd: number) {
  const amount = Math.round(valueUsd * USD_TO_TWD);
  return `約 NT$${new Intl.NumberFormat("zh-TW").format(amount)}`;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 1 }).format(value);
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4">
      <div className="text-xs text-[var(--gray-500)]">{label}</div>
      <div className="mt-2 text-2xl tabular-nums text-[var(--black)]">{value}</div>
      {sub && <div className="mt-1 text-xs leading-5 text-[var(--gray-500)]">{sub}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2 last:border-b-0">
      <span className="text-sm text-[var(--gray-500)]">{label}</span>
      <span className="text-sm tabular-nums text-[var(--black)]">{value}</span>
    </div>
  );
}

export default function UsagePage() {
  const toast = useToast();
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (withToast = false) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/usage", { cache: "no-store" });
        const raw = await res.text();
        let parsed: (UsageData & { error?: string }) | null = null;
        if (raw) {
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = null;
          }
        }
        if (!res.ok) {
          throw new Error(parsed?.error || (res.status >= 500 ? "伺服器計算用量時發生錯誤，請稍後再試" : "讀取用量失敗"));
        }
        if (!parsed) throw new Error("讀取用量失敗");
        setData(parsed);
        if (withToast) toast("已更新用量");
      } catch (err) {
        const message = err instanceof Error ? err.message : "讀取用量失敗";
        setError(message);
        if (withToast) toast(message, "error");
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-dvh bg-[var(--warm-white)]">
      <TopAppBar
        title="用量與預估花費"
        align="left"
        right={
          <button className="btn btn-primary h-9 px-4 text-[13px]" disabled={loading} onClick={() => load(true)} type="button">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
            重新計算
          </button>
        }
      />

      <div className="mx-auto max-w-content-wide space-y-4 p-4 lg:p-6">
        {error && <div className="rounded-xl border border-[var(--red)] bg-[var(--red-bg)] p-3 text-sm text-[var(--red)]">{error}</div>}
        {loading && !data ? (
          <div className="card p-4 text-sm text-[var(--gray-500)]">計算中…</div>
        ) : data ? (
          <>
            <div className="rounded-xl border border-orange bg-orange-bg p-3 text-xs leading-5 text-orange">
              {data.note} 金額以台幣呈現，匯率暫以 1 USD ≈ NT${USD_TO_TWD} 估算。
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="預估總花費" value={twd(data.totals.estimatedCostUsd)} sub={`${data.totals.projects} 個專案，${data.totals.completedProjects} 個已完成`} />
              <MetricCard label="OpenAI 預估" value={twd(data.openai.estimatedCostUsd)} sub="分析、轉錄、分鏡圖" />
              <MetricCard label="Seedance 預估" value={twd(data.seedance.estimatedCostUsd)} sub="影片生成任務" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="card p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm">OpenAI 用量</h2>
                  <span className="rounded-full bg-orange-bg px-2.5 py-1 text-xs text-orange">{twd(data.openai.estimatedCostUsd)}</span>
                </div>
                <div>
                  <Row label="轉錄次數" value={`${data.openai.jobs.transcribe}`} />
                  <Row label="分析呼叫" value={`${data.openai.jobs.analysis}`} />
                  <Row label="改編腳本" value={`${data.openai.jobs.adapt}`} />
                  <Row label="分鏡 prompt" value={`${data.openai.jobs.storyboardPrompts}`} />
                  <Row label="分鏡圖" value={`${data.openai.jobs.storyboardImages} 張`} />
                  <Row label="文字 input tokens" value={compactNumber(data.openai.usage.textInputTokens)} />
                  <Row label="文字 output tokens" value={compactNumber(data.openai.usage.textOutputTokens)} />
                  <Row label="轉錄分鐘" value={`${compactNumber(data.openai.usage.transcribeMinutes)} 分`} />
                  <Row label="圖像 output tokens" value={compactNumber(data.openai.usage.imageOutputTokens)} />
                </div>
                <div className="mt-3 rounded-lg bg-[var(--warm-white)] p-3 text-xs leading-5 text-[var(--gray-500)]">
                  文字 {twd(data.openai.breakdown.textUsd)} · 轉錄 {twd(data.openai.breakdown.transcribeUsd)} · 圖像 {twd(data.openai.breakdown.imageUsd)}
                </div>
              </section>

              <section className="card p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm">Seedance 用量</h2>
                  <span className="rounded-full bg-orange-bg px-2.5 py-1 text-xs text-orange">{twd(data.seedance.estimatedCostUsd)}</span>
                </div>
                <div>
                  <Row label="完成影片" value={`${data.seedance.jobs.completedVideos} 支`} />
                  <Row label="輸出秒數" value={`${data.seedance.usage.outputSeconds} 秒`} />
                </div>
                <div className="mt-3 rounded-lg bg-[var(--warm-white)] p-3 text-xs leading-5 text-[var(--gray-500)]">
                  {data.pricing.seedance}，頁面換算台幣顯示。
                </div>
              </section>
            </div>

            <section className="card p-4">
              <h2 className="mb-3 text-sm">估算單價</h2>
              <div className="grid gap-2 text-xs leading-5 text-[var(--gray-500)] md:grid-cols-2">
                <div className="rounded-lg bg-[var(--warm-white)] p-3">{data.pricing.openai.text}，台幣約按 31.57 倍換算</div>
                <div className="rounded-lg bg-[var(--warm-white)] p-3">{data.pricing.openai.image}，台幣約按 31.57 倍換算</div>
                <div className="rounded-lg bg-[var(--warm-white)] p-3">{data.pricing.openai.transcribe}，台幣約按 31.57 倍換算</div>
                <div className="rounded-lg bg-[var(--warm-white)] p-3">{data.pricing.seedance}，台幣約按 31.57 倍換算</div>
              </div>
              <p className="mt-3 text-xs text-[var(--gray-500)]">
                最後計算：{new Date(data.generatedAt).toLocaleString("zh-TW")}
              </p>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
