"use client";

import { Link2, Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Shell } from "@/components/Shell";

export default function HomePage() {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
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
          sourceUrl: sourceUrl.trim(),
          transcript: transcript.trim() || undefined
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
        <div className="flex h-[60px] items-center justify-between border-b border-[var(--border)] bg-white px-6">
          <h1 className="text-base">lurevid | 短影音分析改編</h1>
          <span className="badge badge-active">IG Reels · TikTok</span>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6">
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

              <button
                className="mt-3 text-xs text-orange"
                onClick={() => setShowTranscript((value) => !value)}
              >
                {showTranscript ? "收起手動逐字稿" : "抓不到影片？手動貼逐字稿（選填）"}
              </button>
              {showTranscript && (
                <textarea
                  className="mt-2 min-h-[120px] w-full resize-y rounded-xl border border-[var(--border-strong)] bg-white p-4 text-sm leading-7 outline-none focus:border-orange"
                  placeholder="把影片字幕／逐字稿貼在這裡，系統會直接拿來分析（IG/TikTok 從機房 IP 常被擋，這是最穩的備援）"
                  value={transcript}
                  onChange={(event) => setTranscript(event.target.value)}
                />
              )}

              <div className="mt-3 flex justify-end">
                <button className="btn btn-primary" disabled={!sourceUrl.trim() || loading} onClick={start}>
                  <Wand2 size={16} />
                  {loading ? "建立中" : "開始分析"}
                </button>
              </div>
              <p className="mt-2 text-xs text-[var(--gray-500)]">影片比例、解析度、秒數會在「變成影片」那一步再選。</p>
              {error && <p className="mt-3 text-sm text-[var(--red)]">{error}</p>}
            </div>

            <div className="card grid min-h-[280px] place-items-center p-8 text-center">
              <div>
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-orange-bg text-orange">
                  <Sparkles size={22} />
                </div>
                <h3>六步流程</h3>
                <p className="mt-1 text-sm text-[var(--gray-500)]">
                  分析 → 分析結構 → 改編 → 分鏡確認 → 變成影片 → 合成。前三步都可以看到結果並修改後再繼續。
                </p>
              </div>
            </div>
          </section>

          <aside className="card h-fit p-4 lg:sticky lg:top-6">
            <p className="text-[11px] uppercase text-orange">Workflow</p>
            <h2 className="mt-1 text-lg">參考爆款、做出自己的</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">
              貼一支 IG Reel 或 TikTok，系統會拆解它為什麼紅，改編成你的腳本，再產生分鏡與影片。
            </p>
            <ol className="mt-4 space-y-2 rounded-xl bg-[var(--warm-white)] p-3 text-sm">
              <li>1. 分析影片</li>
              <li>2. 拆解結構</li>
              <li>3. 改編腳本</li>
              <li>4. 確認分鏡圖</li>
              <li>5. 變成影片</li>
              <li>6. 合成完整影片</li>
            </ol>
          </aside>
        </div>
      </div>
    </Shell>
  );
}
