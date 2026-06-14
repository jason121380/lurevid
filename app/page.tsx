"use client";

import { AlertCircle, CheckCircle2, Link2, Loader2, Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";

type SettingField = {
  key: string;
  configured: boolean;
  value: string;
  defaultValue: string;
};

const apiGroups = [
  { title: "OpenAI", keys: ["OPENAI_API_KEY", "OPENAI_STORY_MODEL", "OPENAI_PROMPT_MODEL", "OPENAI_IMAGE_MODEL", "OPENAI_TRANSCRIBE_MODEL"] },
  { title: "Seedance", keys: ["ARK_API_KEY", "SEEDANCE_MODEL"] },
  { title: "S3", keys: ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL"] }
];

export default function HomePage() {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<SettingField[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSettings() {
      setSettingsLoading(true);
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        if (res.ok) setSettings(data.fields);
      } finally {
        setSettingsLoading(false);
      }
    }

    loadSettings();
  }, []);

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
        <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-white px-6 py-3">
          <h1 className="text-base">lurevid | 短影音分析改編</h1>
          <ApiStatus fields={settings} loading={settingsLoading} />
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
                {showTranscript ? "收起手動逐字稿" : "手動貼逐字稿（選填備援）"}
              </button>
              {showTranscript && (
                <textarea
                  className="mt-2 min-h-[120px] w-full resize-y rounded-xl border border-[var(--border-strong)] bg-white p-4 text-sm leading-7 outline-none focus:border-orange"
                  placeholder="可選填。沒貼時系統會自動下載影片、抽影格分析畫面，並把音訊轉成逐字稿；若 IG/TikTok 擋住抓取，再改貼字幕／逐字稿。"
                  value={transcript}
                  onChange={(event) => setTranscript(event.target.value)}
                />
              )}

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

            <div className="card grid min-h-[280px] place-items-center p-8 text-center">
              <div>
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-orange-bg text-orange">
                  <Sparkles size={22} />
                </div>
                <h3>六步流程</h3>
                <p className="mt-1 text-sm text-[var(--gray-500)]">
                  分析影片內容與畫面 → 分析結構 → 改編 → 分鏡確認 → 變成影片 → 合成。前三步都可以看到結果並修改後再繼續。
                </p>
              </div>
            </div>
          </section>

          <aside className="card h-fit p-4 lg:sticky lg:top-6">
            <p className="text-[11px] uppercase text-orange">Workflow</p>
            <h2 className="mt-1 text-lg">參考爆款、做出自己的</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">
              貼一支 IG Reel 或 TikTok，系統會拆解它的逐字稿、畫面分鏡與剪輯節奏，改編成你的腳本，再產生分鏡與影片。
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

function ApiStatus({ fields, loading }: { fields: SettingField[]; loading: boolean }) {
  const configured = (key: string) => {
    const field = fields.find((item) => item.key === key);
    if (!field) return false;
    return Boolean(field.configured || field.value || field.defaultValue);
  };

  const statuses = apiGroups.map((group) => ({
    title: group.title,
    ready: group.keys.every(configured)
  }));
  const readyCount = statuses.filter((status) => status.ready).length;

  if (loading) {
    return (
      <span className="badge badge-warn inline-flex items-center gap-1">
        <Loader2 size={12} className="animate-spin" />
        API 狀態讀取中
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className={readyCount === statuses.length ? "badge badge-active" : "badge badge-warn"}>API 狀態 {readyCount}/{statuses.length}</span>
      {statuses.map((status) => (
        <span className={`badge inline-flex items-center gap-1 ${status.ready ? "badge-active" : "badge-error"}`} key={status.title}>
          {status.ready ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
          {status.title}
        </span>
      ))}
    </div>
  );
}
