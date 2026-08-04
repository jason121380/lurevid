"use client";

import { Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

const MIN_PASSWORD_LENGTH = 8;

function ResetPasswordForm() {
  const toast = useToast();
  const router = useRouter();
  const token = useSearchParams().get("token") || "";

  const [checking, setChecking] = useState(true);
  const [tokenError, setTokenError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let stopped = false;
    async function check() {
      if (!token) {
        setTokenError("這個重設連結不完整，請重新申請一次。");
        setChecking(false);
        return;
      }
      try {
        const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (stopped) return;
        if (!res.ok || !data.valid) setTokenError(data.error || "這個重設連結已失效，請重新申請一次。");
      } catch {
        if (!stopped) setTokenError("暫時無法驗證這個連結，請稍後再試。");
      } finally {
        if (!stopped) setChecking(false);
      }
    }
    check();
    return () => {
      stopped = true;
    };
  }, [token]);

  async function submit() {
    if (loading) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`密碼至少 ${MIN_PASSWORD_LENGTH} 個字元`);
      return;
    }
    if (password !== confirm) {
      setError("兩次輸入的密碼不一致");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "重設密碼失敗");
        toast(data.error || "重設密碼失敗", "error");
        return;
      }
      toast("密碼已更新，請重新登入");
      router.push("/login");
    } catch {
      setError("API 沒有回應，請稍後再試");
      toast("API 沒有回應", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-start bg-[var(--warm-white)] p-5 pt-[clamp(64px,14dvh,140px)] sm:place-items-center sm:pt-5">
      <section className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <Image className="mx-auto h-7 w-auto" src="/logo.svg" alt="lurevid" width={132} height={28} priority />
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-[var(--black)]">設定新密碼</h1>
          <p className="mt-1.5 text-[13px] text-[var(--gray-500)]">設定完成後請用新密碼登入</p>
        </div>

        {checking ? (
          <div className="surface grid place-items-center p-8 shadow-md">
            <Loader2 className="animate-spin text-orange" />
          </div>
        ) : tokenError ? (
          <div className="surface space-y-4 p-5 text-center shadow-md">
            <p className="text-[13px] leading-6 text-[var(--red)]">{tokenError}</p>
            <Link className="btn btn-primary w-full" href="/forgot-password">
              重新申請重設連結
            </Link>
          </div>
        ) : (
          <div className="surface space-y-3.5 p-5 shadow-md">
            <label className="grid gap-1.5 text-sm">
              <span className="text-[13px] text-[var(--gray-500)]">新密碼</span>
              <input
                className="field"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) setError("");
                }}
                placeholder={`至少 ${MIN_PASSWORD_LENGTH} 個字元`}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-[13px] text-[var(--gray-500)]">再輸入一次</span>
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
              <div className="rounded-md border border-[var(--red)]/30 bg-[var(--red-bg)] p-3 text-[13px] leading-6 text-[var(--red)]" role="alert">
                {error}
              </div>
            )}

            <button className="btn btn-primary w-full" disabled={loading || !password || !confirm} onClick={submit} type="button">
              {loading && <Loader2 size={15} className="animate-spin" />}
              更新密碼
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center bg-[var(--warm-white)]">
          <Loader2 className="animate-spin text-orange" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
