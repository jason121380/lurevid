"use client";

import { Clapperboard, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Shell } from "@/components/Shell";

export default function HomePage() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [ratio, setRatio] = useState("16:9");
  const [resolution, setResolution] = useState("720p");
  const [duration, setDuration] = useState(5);
  const [loading, setLoading] = useState<"storyboard" | "project" | "">("");
  const [error, setError] = useState("");

  async function createStoryboard() {
    if (!idea.trim()) return;
    setError("");
    setLoading("storyboard");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, settings: { ratio, resolution, duration } })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "建立分鏡圖專案失敗");
        return;
      }
      router.push(`/projects/${data.id}`);
    } catch {
      setError("建立分鏡圖專案 API 沒有回應，請確認本機伺服器正在執行");
    } finally {
      setLoading("");
    }
  }

  return (
    <Shell>
    <div className="min-h-screen bg-[var(--warm-white)]">
      <div className="flex h-[60px] items-center justify-between border-b border-[var(--border)] bg-white px-6">
        <h1 className="text-base">lurevid | AI 影像大師</h1>
        <span className="badge badge-active">正式版架構</span>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6">
        <section className="space-y-4">
          <div className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Wand2 size={18} className="text-orange" />
              <h2 className="text-sm">輸入想法</h2>
            </div>
            <textarea
              className="min-h-[148px] w-full resize-y rounded-xl border border-[var(--border-strong)] bg-white p-4 text-sm leading-7 outline-none focus:border-orange"
              placeholder="例如：一支介紹台灣手搖飲品牌的 30 秒形象短片，清爽、年輕、夏天感"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
            />
            <div className="mt-3 grid gap-2 md:grid-cols-[110px_120px_120px_auto]">
              <select className="rounded-full border border-[var(--border-strong)] px-3 text-sm" value={ratio} onChange={(event) => setRatio(event.target.value)}>
                <option>16:9</option>
                <option>9:16</option>
                <option>1:1</option>
              </select>
              <select className="rounded-full border border-[var(--border-strong)] px-3 text-sm" value={resolution} onChange={(event) => setResolution(event.target.value)}>
                <option>720p</option>
                <option>1080p</option>
                <option>480p</option>
              </select>
              <select className="rounded-full border border-[var(--border-strong)] px-3 text-sm" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                <option value={3}>每段 3 秒</option>
                <option value={4}>每段 4 秒</option>
                <option value={5}>每段 5 秒</option>
              </select>
              <button className="btn btn-primary" disabled={!idea.trim() || !!loading} onClick={createStoryboard}>
                <Clapperboard size={16} />
                {loading === "storyboard" ? "產生中" : "產生分鏡圖"}
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-[var(--red)]">{error}</p>}
            {loading === "storyboard" && <p className="mt-3 text-sm text-[var(--gray-500)]">正在建立專案，worker 會開始產生 9 張分鏡圖。</p>}
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <div className="card col-span-full grid min-h-[360px] place-items-center p-8 text-center">
              <div>
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-orange-bg text-orange">
                  <Clapperboard size={22} />
                </div>
                <h3>流程</h3>
                <p className="mt-1 text-sm text-[var(--gray-500)]">輸入想法後，系統會先產生 9 張分鏡圖。確認畫面後，再按「變成影片」。</p>
              </div>
            </div>
          </div>
        </section>

        <aside className="card h-fit p-4 lg:sticky lg:top-6">
          <div className="mb-4">
            <p className="text-[11px] uppercase text-orange">Production</p>
            <h2 className="mt-1 text-lg">完整影片生成</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">
              第一段先產生分鏡圖，第二段才把分鏡圖變成 Seedance 影片並合成。
            </p>
          </div>
          <div className="space-y-2 rounded-xl bg-[var(--warm-white)] p-3 text-sm">
            <div className="flex justify-between"><span>分鏡圖</span><span>9 張</span></div>
            <div className="flex justify-between"><span>比例</span><span>{ratio}</span></div>
            <div className="flex justify-between"><span>解析度</span><span>{resolution}</span></div>
            <div className="flex justify-between"><span>預估秒數</span><span>{9 * duration}s</span></div>
          </div>
          <button className="btn btn-primary mt-4 w-full" disabled={!idea.trim() || !!loading} onClick={createStoryboard}>
            {loading === "storyboard" ? "產生中" : "產生分鏡圖"}
          </button>
        </aside>
      </div>
    </div>
    </Shell>
  );
}
