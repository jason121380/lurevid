"use client";

import { Upload, Wand2 } from "lucide-react";
import Image from "next/image";
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
    <div className="min-h-dvh bg-[var(--warm-white)]">
      <div className="flex min-h-dvh flex-col items-center justify-center px-5 pb-24 pt-[clamp(48px,12dvh,120px)]">
        <section className="w-full max-w-md">
          <div className="mb-7 text-center">
            <Image className="mx-auto h-7 w-auto" src="/logo.svg" alt="lurevid" width={132} height={28} priority />
            <h1 className="mt-6 text-[1.6rem] font-semibold leading-tight tracking-tight text-[var(--black)]">
              今天想分析哪支影片呢 👀
            </h1>
            <p className="mt-2 text-[14px] leading-6 text-[var(--gray-500)]">
              貼上連結或上傳影片，AI 會分析、改編並重新生成。
            </p>
          </div>

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

          <div className="surface flex items-center gap-1.5 p-1.5 shadow-md transition focus-within:border-[var(--orange-border)]">
            <button
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--gray-400)] transition hover:bg-[var(--surface-muted)] hover:text-orange disabled:cursor-not-allowed disabled:text-[var(--gray-300)]"
              disabled={loading || uploading}
              onClick={() => fileInputRef.current?.click()}
              title={uploading ? "上傳中" : "上傳影片檔案"}
              type="button"
            >
              <Upload size={18} />
            </button>
            <input
              className="min-w-0 flex-1 border-0 bg-transparent px-1 py-2.5 text-[15px] outline-none placeholder:text-[var(--gray-300)]"
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
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-orange text-white shadow-[0_6px_16px_rgb(255_107_44/0.22)] transition hover:bg-[var(--orange-dark)] disabled:cursor-not-allowed disabled:bg-[var(--gray-200)] disabled:shadow-none"
              disabled={!canSubmit}
              onClick={start}
              title={loading || uploading ? "建立中" : "開始分析"}
              type="button"
            >
              <Wand2 size={16} />
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[12px] text-[var(--gray-500)]">
            <span>支援來源</span>
            {["TikTok", "IG Reels", "上傳影片"].map((name) => (
              <span key={name} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[var(--gray-500)]">
                {name}
              </span>
            ))}
          </div>

          {error && (
            <div className="mt-5 rounded-md border border-[var(--red)]/30 bg-[var(--red-bg)] p-3 text-[13px] leading-6 text-[var(--red)]" role="alert">
              {error}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
