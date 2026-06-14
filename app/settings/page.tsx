"use client";

import { Eye, EyeOff, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/Shell";

type SettingField = {
  key: string;
  label: string;
  secret: boolean;
  defaultValue: string;
  value: string;
  configured: boolean;
  maskedValue: string;
};

export default function SettingsPage() {
  const [fields, setFields] = useState<SettingField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "讀取設定失敗");
        setFields(data.fields);
        setValues(
          Object.fromEntries(
            data.fields.map((field: SettingField) => [field.key, field.secret ? "" : field.value || field.defaultValue || ""])
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "讀取設定失敗");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const groups = useMemo(
    () => [
      { title: "OpenAI", keys: ["OPENAI_API_KEY", "OPENAI_STORY_MODEL", "OPENAI_PROMPT_MODEL", "OPENAI_IMAGE_MODEL", "OPENAI_TRANSCRIBE_MODEL"] },
      { title: "Seedance", keys: ["ARK_API_KEY", "SEEDANCE_MODEL"] },
      { title: "S3 物件儲存", keys: ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL", "S3_FORCE_PATH_STYLE"] }
    ],
    []
  );

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "儲存設定失敗");
      setMessage("設定已儲存，下一個 worker 任務會使用最新設定。");
      const refreshed = await fetch("/api/settings").then((response) => response.json());
      setFields(refreshed.fields);
      setValues(
        Object.fromEntries(
          refreshed.fields.map((field: SettingField) => [field.key, field.secret ? "" : field.value || field.defaultValue || ""])
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存設定失敗");
    } finally {
      setSaving(false);
    }
  }

  function fieldByKey(key: string) {
    return fields.find((field) => field.key === key);
  }

  return (
    <Shell>
      <div className="min-h-screen bg-[var(--warm-white)]">
        <div className="flex h-[60px] items-center justify-between border-b border-[var(--border)] bg-white px-6">
          <h1 className="text-base">設定</h1>
          <button className="btn btn-primary" disabled={saving || loading} onClick={save}>
            <Save size={16} />
            {saving ? "儲存中" : "儲存"}
          </button>
        </div>

        <div className="mx-auto max-w-5xl space-y-4 p-4 lg:p-6">
          {message && <div className="rounded-xl border border-[var(--green)] bg-[var(--green-bg)] p-3 text-sm text-[var(--green)]">{message}</div>}
          {error && <div className="rounded-xl border border-[var(--red)] bg-[var(--red-bg)] p-3 text-sm text-[var(--red)]">{error}</div>}

          {loading ? (
            <div className="card p-4 text-sm text-[var(--gray-500)]">載入設定中</div>
          ) : (
            groups.map((group) => (
              <section className="card p-4" key={group.title}>
                <h2 className="mb-4 text-sm">{group.title}</h2>
                <div className="grid gap-3">
                  {group.keys.map((key) => {
                    const field = fieldByKey(key);
                    if (!field) return null;
                    const inputType = field.secret && !revealed[key] ? "password" : "text";
                    return (
                      <label className="grid gap-2 text-sm md:grid-cols-[220px_minmax(0,1fr)] md:items-center" key={key}>
                        <span className="text-[var(--gray-500)]">{field.label}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <input
                              className="min-w-0 flex-1 rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-orange"
                              placeholder={field.secret && field.configured ? field.maskedValue : field.defaultValue || field.key}
                              type={inputType}
                              value={values[key] || ""}
                              onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                            />
                            {field.secret && (
                              <button
                                className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border-strong)] bg-white text-[var(--gray-500)]"
                                onClick={(event) => {
                                  event.preventDefault();
                                  setRevealed((current) => ({ ...current, [key]: !current[key] }));
                                }}
                                title={revealed[key] ? "隱藏" : "顯示"}
                              >
                                {revealed[key] ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            )}
                          </div>
                          {field.secret && field.configured && !values[key] && (
                            <p className="mt-1 text-xs text-[var(--gray-500)]">已設定：{field.maskedValue}。留空儲存會保留原值。</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </Shell>
  );
}
