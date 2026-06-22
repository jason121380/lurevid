"use client";

import { Upload, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useToast } from "@/components/Toast";

function isSupportedVideoUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return true;
  return (host === "instagram.com" || host.endsWith(".instagram.com")) && /^\/reels?\//i.test(parsed.pathname);
}

export default function HomePage() {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const trimmedSourceUrl = sourceUrl.trim();
  const canSubmit = Boolean(trimmedSourceUrl) && !loading && !uploading;

  async function start() {
    if (!trimmedSourceUrl) return;
    if (!isSupportedVideoUrl(trimmedSourceUrl)) {
      const message = "目前只接受 TikTok 或 IG Reels 連結";
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

  async function uploadVideo(file: File) {
    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/projects/upload", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "上傳影片失敗");
        toast(data.error || "上傳影片失敗", "error");
        return;
      }
      toast("已上傳影片，開始分析");
      window.dispatchEvent(new Event("lurevid:projects-changed"));
      router.push(`/projects/${data.id}`);
    } catch {
      setError("API 沒有回應，請確認伺服器正在執行");
      toast("API 沒有回應", "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-[var(--warm-white)] md:min-h-screen">
      <div className="flex min-h-[calc(100dvh-3.5rem)] items-start justify-center px-4 pb-10 pt-[clamp(56px,14dvh,120px)] md:min-h-screen md:items-center md:p-8">
        <section className="w-full max-w-xl md:-translate-y-12">
          <h2 className="mb-5 text-center text-[1.55rem] leading-tight tracking-normal text-[var(--black)] md:text-2xl">
            今天想分析哪支影片呢 👀
          </h2>
          <div className="rounded-2xl border border-[var(--border-strong)] bg-white p-2 shadow-[0_14px_48px_rgb(26_26_26/0.04)] transition focus-within:border-orange md:rounded-full">
            <div className="grid gap-2 md:min-h-10 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
              <input
                ref={fileInputRef}
                className="sr-only"
                aria-label="上傳影片檔案"
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void uploadVideo(file);
                }}
              />
              <button
                className="grid h-11 w-11 place-items-center rounded-xl text-[var(--gray-400)] transition hover:bg-[var(--warm-white)] hover:text-orange disabled:cursor-not-allowed disabled:text-[var(--gray-300)] md:h-9 md:w-9 md:rounded-full"
                disabled={loading || uploading}
                onClick={() => fileInputRef.current?.click()}
                title={uploading ? "上傳中" : "上傳影片檔案"}
                type="button"
              >
                <Upload size={16} />
              </button>
              <input
                className="min-w-0 border-0 bg-transparent px-3 py-3 text-base outline-none placeholder:text-[var(--gray-300)] md:px-1 md:py-1 md:text-sm"
                placeholder="貼上 TikTok 或 IG Reels 連結"
                aria-label="TikTok 或 IG Reels 連結"
                type="url"
                inputMode="url"
                enterKeyHint="go"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
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
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange px-4 text-sm text-white transition hover:bg-[var(--orange-dark)] disabled:cursor-not-allowed disabled:bg-[var(--gray-200)] md:h-9 md:w-9 md:rounded-full md:px-0"
                disabled={!canSubmit}
                onClick={start}
                title={loading || uploading ? "建立中" : "開始分析"}
              >
                <Wand2 size={14} />
                <span className="md:sr-only">{loading || uploading ? "建立中" : "開始分析"}</span>
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-[var(--gray-500)]">
            <span>支援來源</span>
            {["TikTok link", "IG Reels link", "上傳影片"].map((name) => (
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
