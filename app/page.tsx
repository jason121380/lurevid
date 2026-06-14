"use client";

import { Link2, Settings, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Shell } from "@/components/Shell";

export default function HomePage() {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    if (!sourceUrl.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: sourceUrl.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "建立專案失敗");
        return;
      }
      router.push(`/projects/${data.id}`);
    } catch {
      setError("API 沒有回應，請確認伺服器正在執行");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <div className="min-h-screen bg-[var(--warm-white)]">
        <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-white px-6 py-3">
          <h1 className="text-base">lurevid | 短影音分析創作平台</h1>
          <Link className="btn btn-ghost" href="/settings">
            <Settings size={16} />
            設定
          </Link>
        </div>

        <div className="p-4 lg:p-6">
          <section className="space-y-4">
            <div className="card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Link2 size={18} className="text-orange" />
                <h2 className="text-sm">貼上參考影片連結</h2>
              </div>
              <input
                className="w-full rounded-xl border border-[var(--border-strong)] bg-white p-4 text-sm outline-none focus:border-orange"
                placeholder="https://www.instagram.com/reel/...　或　https://www.tiktok.com/@.../video/..."
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                {!sourceUrl.trim() && (
                  <p className="text-xs text-[var(--gray-500)]">先貼上 Reels 或 TikTok 連結後才能開始。</p>
                )}
                <button className="btn btn-primary" disabled={!sourceUrl.trim() || loading} onClick={start}>
                  <Wand2 size={16} />
                  {loading ? "建立中" : "開始分析"}
                </button>
              </div>
              <p className="mt-2 text-xs text-[var(--gray-500)]">沒貼逐字稿時會自動分析影片音訊、畫面影格、字幕與分鏡節奏；影片比例、解析度、秒數會在「變成影片」那一步再選。</p>
              {error && (
                <div className="mt-3 rounded-xl border border-[var(--red)] bg-red-50 p-3 text-sm leading-6 text-[var(--red)]" role="alert">
                  {error}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
