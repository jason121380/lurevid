"use client";

import { Plus, Settings, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Shell } from "@/components/Shell";

export default function HomePage() {
  const router = useRouter();
  const [projectTitle, setProjectTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    if (!projectTitle.trim() || !sourceUrl.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: projectTitle.trim(),
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
        <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-white px-4 py-3 md:px-6">
          <h1 className="min-w-0 text-sm md:text-base">lurevid | 短影音分析創作平台</h1>
          <Link className="btn btn-ghost" href="/settings">
            <Settings size={16} />
            設定
          </Link>
        </div>

        <div className="grid min-h-[calc(100vh-60px)] place-items-center p-4 md:p-8">
          <section className="w-full max-w-5xl -translate-y-8 md:-translate-y-12">
            <h2 className="mb-12 text-center text-3xl font-normal tracking-normal text-[var(--black)] md:text-4xl">
              今天想分析哪支影片？
            </h2>
            <div className="rounded-[34px] border border-[var(--border-strong)] bg-white px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.08)] md:rounded-[40px] md:px-6">
              <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_220px_auto] md:items-center">
                <div className="hidden h-9 w-9 place-items-center text-[var(--black)] md:grid">
                  <Plus size={25} strokeWidth={1.8} />
                </div>
                <input
                  className="min-w-0 border-0 bg-transparent px-1 py-2 text-base outline-none placeholder:text-[var(--gray-300)] md:text-xl"
                  placeholder="貼上 IG Reel 或 TikTok 影片連結"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") start();
                  }}
                />
                <input
                  className="min-w-0 rounded-full border border-[var(--border)] bg-[var(--warm-white)] px-4 py-2 text-sm outline-none placeholder:text-[var(--gray-300)] focus:border-orange"
                  placeholder="專案名稱"
                  value={projectTitle}
                  onChange={(event) => setProjectTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") start();
                  }}
                />
                <button
                  className="grid h-12 w-full place-items-center rounded-full bg-orange text-white transition hover:bg-[var(--orange-dark)] disabled:cursor-not-allowed disabled:bg-[var(--gray-200)] md:h-14 md:w-14"
                  disabled={!projectTitle.trim() || !sourceUrl.trim() || loading}
                  onClick={start}
                  title={loading ? "建立中" : "開始分析"}
                >
                  <Wand2 size={21} />
                </button>
              </div>
            </div>
            {error && (
              <div className="mx-auto mt-4 max-w-3xl rounded-2xl border border-[var(--red)] bg-red-50 p-3 text-sm leading-6 text-[var(--red)]" role="alert">
                {error}
              </div>
            )}
          </section>
        </div>
      </div>
    </Shell>
  );
}
