"use client";

import { ChevronDown, Eye, EyeOff, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";

type SettingField = {
  key: string;
  label: string;
  secret: boolean;
  defaultValue: string;
  placeholder?: string;
  value: string;
  configured: boolean;
  maskedValue: string;
};

type SettingGroup = {
  title: string;
  description: string;
  keys: string[];
  requiredKeys: string[];
};

type GroupStatus = {
  state: "ready" | "pending" | "missing";
  label: string;
  detail: string;
  missingLabels: string[];
};

const groups: SettingGroup[] = [
  {
    title: "OpenAI",
    description: "分析、視覺理解、圖片與音訊轉錄會用這組設定。",
    keys: ["OPENAI_API_KEY", "OPENAI_STORY_MODEL", "OPENAI_PROMPT_MODEL", "OPENAI_IMAGE_MODEL", "OPENAI_TRANSCRIBE_MODEL"],
    requiredKeys: ["OPENAI_API_KEY", "OPENAI_STORY_MODEL", "OPENAI_PROMPT_MODEL", "OPENAI_IMAGE_MODEL", "OPENAI_TRANSCRIBE_MODEL"]
  },
  {
    title: "Seedance",
    description: "把分鏡變成影片片段時會用這組設定。",
    keys: ["ARK_API_KEY", "SEEDANCE_MODEL"],
    requiredKeys: ["ARK_API_KEY", "SEEDANCE_MODEL"]
  },
  {
    title: "R2 物件儲存（Cloudflare）",
    description: "儲存分鏡圖、影片片段與 final.mp4，並提供前台播放網址。bucket 需開公開讀取。",
    keys: ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL", "S3_FORCE_PATH_STYLE"],
    requiredKeys: ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL"]
  }
];

export default function SettingsPage() {
  const [fields, setFields] = useState<SettingField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function loadSettings() {
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
      setExpanded((current) => {
        if (Object.keys(current).length) return current;
        const next: Record<string, boolean> = {};
        for (const group of groups) {
          next[group.title] = group.requiredKeys.some((key) => {
            const field = data.fields.find((item: SettingField) => item.key === key);
            return !field || !field.configured && !(field.value || field.defaultValue);
          });
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "讀取設定失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

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
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存設定失敗");
    } finally {
      setSaving(false);
    }
  }

  function fieldByKey(key: string) {
    return fields.find((field) => field.key === key);
  }

  function hasUnsavedValue(field: SettingField) {
    const value = values[field.key]?.trim() || "";
    if (field.secret) return Boolean(value);
    return value !== (field.value || field.defaultValue || "");
  }

  function isConfigured(key: string) {
    const field = fieldByKey(key);
    if (!field) return false;
    const currentValue = values[key]?.trim() || "";
    if (field.secret) return field.configured || Boolean(currentValue);
    return Boolean(currentValue || field.value || field.defaultValue);
  }

  function groupStatus(group: SettingGroup): GroupStatus {
    const groupFields = group.keys.map(fieldByKey).filter(Boolean) as SettingField[];
    const dirty = groupFields.some(hasUnsavedValue);
    const missingLabels = group.requiredKeys
      .map((key) => fieldByKey(key))
      .filter((field): field is SettingField => Boolean(field))
      .filter((field) => !isConfigured(field.key))
      .map((field) => field.label);

    if (dirty) {
      return {
        state: "pending",
        label: "有未儲存變更",
        detail: "儲存後 worker 才會使用這些新設定。",
        missingLabels
      };
    }

    if (missingLabels.length) {
      return {
        state: "missing",
        label: "尚未完成",
        detail: `缺少 ${missingLabels.join("、")}`,
        missingLabels
      };
    }

    return {
      state: "ready",
      label: "已設定",
      detail: "下一個任務會使用這組設定。",
      missingLabels: []
    };
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
            <>
              {groups.map((group) => {
                const status = groupStatus(group);

                return (
                  <section className="card overflow-hidden" key={group.title}>
                    <button
                      className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
                      onClick={() => setExpanded((current) => ({ ...current, [group.title]: !current[group.title] }))}
                      type="button"
                    >
                      <div>
                        <h2 className="text-sm">{group.title}</h2>
                        <p className="mt-1 text-xs leading-5 text-[var(--gray-500)]">{group.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={status} />
                        <ChevronDown className={`text-[var(--gray-500)] transition-transform ${expanded[group.title] ? "rotate-180" : ""}`} size={18} />
                      </div>
                    </button>
                    {expanded[group.title] && (
                      <div className="grid gap-3 border-t border-[var(--border)] p-4">
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
                                    placeholder={field.secret && field.configured ? field.maskedValue : field.placeholder || field.defaultValue || field.key}
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
                                      type="button"
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
                    )}
                  </section>
                );
              })}
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}

function StatusBadge({ status }: { status: GroupStatus }) {
  const className =
    status.state === "ready"
      ? "border-[var(--green)] bg-[var(--green-bg)] text-[var(--green)]"
      : status.state === "pending"
        ? "border-orange bg-orange-bg text-orange"
        : "border-[var(--red)] bg-[var(--red-bg)] text-[var(--red)]";

  return <span className={`rounded-full border px-3 py-1 text-xs ${className}`}>{status.label}</span>;
}
