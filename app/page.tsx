"use client";

import { Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/Toast";

function isTikTokUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return host === "tiktok.com" || host.endsWith(".tiktok.com");
}

export default function HomePage() {
  const router = useRouter();
  const toast = useToast();
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const trimmedSourceUrl = sourceUrl.trim();
  const canSubmit = Boolean(trimmedSourceUrl) && !loading;

  async function start() {
    if (!trimmedSourceUrl) return;
    if (!isTikTokUrl(trimmedSourceUrl)) {
      const message = "目前只接受 TikTok 影片連結";
      setError(message);
      toast(message, "error");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: trimmedSourceUrl
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "建立專案失敗");
        toast(data.error || "建立專案失敗", "error");
        return;
      }
      toast("已建立專案，開始分析");
      window.dispatchEvent(new Event("lurevid:projects-changed"));
      router.push(`/projects/${data.id}`);
    } catch {
      setError("API 沒有回應，請確認伺服器正在執行");
      toast("API 沒有回應", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--warm-white)]">
      <div className="grid min-h-screen place-items-center p-4 md:p-8">
        <section className="w-full max-w-xl -translate-y-8 md:-translate-y-12">
          <h2 className="mb-5 text-center text-xl font-normal tracking-normal text-[var(--black)] md:text-2xl">
            今天想分析哪支影片呢 👀
          </h2>
          <div className="rounded-full border border-[var(--border-strong)] bg-white px-3 py-2 transition focus-within:border-orange">
            <div className="grid min-h-10 gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <input
                className="min-w-0 border-0 bg-transparent px-1 py-1 text-xs outline-none placeholder:text-[var(--gray-300)] md:text-sm"
                placeholder="貼上 TikTok 影片連結"
                value={sourceUrl}
                onChange={(event) => {
                  setSourceUrl(event.target.value);
                  if (error) setError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") start();
                }}
              />
              <button
                className="grid h-8 w-full place-items-center rounded-full bg-orange text-white transition hover:bg-[var(--orange-dark)] disabled:cursor-not-allowed disabled:bg-[var(--gray-200)] md:h-9 md:w-9"
                disabled={!canSubmit}
                onClick={start}
                title={loading ? "建立中" : "開始分析"}
              >
                <Wand2 size={14} />
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] text-[var(--gray-500)]">
            <span>支援平台</span>
            {["TikTok"].map((name) => (
              <span key={name} className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[var(--gray-500)]">
                {name}
              </span>
            ))}
          </div>
          {error && (
            <div className="mx-auto mt-4 max-w-3xl rounded-2xl border border-[var(--red)] bg-red-50 p-3 text-sm leading-6 text-[var(--red)]" role="alert">
              {error}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
