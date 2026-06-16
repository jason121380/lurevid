"use client";

import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

type CheckStatus = "ok" | "warn" | "error";
type Check = { key: string; label: string; status: CheckStatus; detail: string };

function dotClass(status: CheckStatus) {
  if (status === "ok") return "bg-[var(--green)]";
  if (status === "warn") return "bg-orange";
  return "bg-[var(--red)]";
}

function badgeClass(status: CheckStatus) {
  if (status === "ok") return "border-[var(--green)] bg-[var(--green-bg)] text-[var(--green)]";
  if (status === "warn") return "border-orange bg-orange-bg text-orange";
  return "border-[var(--red)] bg-[var(--red-bg)] text-[var(--red)]";
}

function statusLabel(status: CheckStatus) {
  if (status === "ok") return "正常";
  if (status === "warn") return "注意";
  return "異常";
}

export default function HealthPage() {
  const toast = useToast();
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState("");

  const load = useCallback(
    async (withToast = false) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/health/status", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "讀取健康狀態失敗");
        setChecks(data.checks || []);
        setCheckedAt(data.checkedAt || "");
        if (withToast) toast("已重新檢查");
      } catch (err) {
        const message = err instanceof Error ? err.message : "讀取健康狀態失敗";
        setError(message);
        if (withToast) toast(message, "error");
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  const cleanFailed = useCallback(async () => {
    setCleaning(true);
    setError("");
    try {
      const res = await fetch("/api/health/clean-failed", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "清除失敗");
      toast("已清除失敗紀錄");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "清除失敗";
      setError(message);
      toast(message, "error");
    } finally {
      setCleaning(false);
    }
  }, [load, toast]);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(), 15000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="min-h-screen bg-[var(--warm-white)]">
        <div className="flex h-[60px] items-center justify-between border-b border-[var(--border)] bg-white px-6">
          <h1 className="text-base">系統健康檢查</h1>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost" disabled={cleaning || loading} onClick={cleanFailed} type="button">
              {cleaning ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              清除失敗紀錄
            </button>
            <button className="btn btn-primary" disabled={loading} onClick={() => load(true)} type="button">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
              重新檢查
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-4xl space-y-4 p-4 lg:p-6">
          {error && <div className="rounded-xl border border-[var(--red)] bg-[var(--red-bg)] p-3 text-sm text-[var(--red)]">{error}</div>}
          {checkedAt && <p className="text-xs text-[var(--gray-500)]">最後檢查：{new Date(checkedAt).toLocaleString("zh-TW")}（每 15 秒自動更新）</p>}

          {loading && checks.length === 0 ? (
            <div className="card p-4 text-sm text-[var(--gray-500)]">檢查中…</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {checks.map((check) => (
                <div className="card flex items-center justify-between gap-3 p-4" key={check.key}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass(check.status)}`} />
                    <div className="min-w-0">
                      <div className="text-sm text-[var(--black)]">{check.label}</div>
                      <div className="truncate text-xs text-[var(--gray-500)]">{check.detail}</div>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${badgeClass(check.status)}`}>{statusLabel(check.status)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}
