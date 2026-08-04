"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/Toast";

const MIN_PASSWORD_LENGTH = 8;

export function ChangePasswordCard() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
    setError("");
  }

  async function submit() {
    if (saving) return;
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`新密碼至少 ${MIN_PASSWORD_LENGTH} 個字元`);
      return;
    }
    if (newPassword !== confirm) {
      setError("兩次輸入的新密碼不一致");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "更新密碼失敗");
        toast(data.error || "更新密碼失敗", "error");
        return;
      }
      toast("密碼已更新");
      reset();
      setOpen(false);
    } catch {
      setError("API 沒有回應，請稍後再試");
      toast("API 沒有回應", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="surface overflow-hidden">
      <button
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[var(--surface-muted)]"
        onClick={() => {
          setOpen((value) => !value);
          if (open) reset();
        }}
        type="button"
        aria-expanded={open}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-orange-bg text-orange">
          <KeyRound size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] text-[var(--black)]">變更密碼</span>
          <span className="block text-[12px] text-[var(--gray-400)]">更新這個帳號的登入密碼</span>
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-[var(--border)] p-4">
          <label className="grid gap-1.5 text-sm">
            <span className="text-[13px] text-[var(--gray-500)]">目前的密碼</span>
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                if (error) setError("");
              }}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-[13px] text-[var(--gray-500)]">新密碼</span>
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                if (error) setError("");
              }}
              placeholder={`至少 ${MIN_PASSWORD_LENGTH} 個字元`}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-[13px] text-[var(--gray-500)]">再輸入一次新密碼</span>
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value);
                if (error) setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
            />
          </label>

          {error && (
            <p className="rounded-md bg-[var(--red-bg)] px-3 py-2 text-[12px] leading-5 text-[var(--red)]" role="alert">
              {error}
            </p>
          )}

          <button
            className="btn btn-primary w-full"
            disabled={saving || !currentPassword || !newPassword || !confirm}
            onClick={submit}
            type="button"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            更新密碼
          </button>
        </div>
      )}
    </div>
  );
}
