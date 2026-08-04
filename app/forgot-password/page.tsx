"use client";

import { Loader2, MailCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/Toast";

export default function ForgotPasswordPage() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sentMessage, setSentMessage] = useState("");

  async function submit() {
    if (!email.trim() || loading) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "寄送重設信失敗");
        toast(data.error || "寄送重設信失敗", "error");
        return;
      }
      setSentMessage(data.message || "如果這個 Email 有註冊過，我們已經寄出重設密碼的信。");
      toast("已寄出重設信");
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
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-[var(--black)]">忘記密碼</h1>
          <p className="mt-1.5 text-[13px] text-[var(--gray-500)]">輸入註冊時的 Email，我們會寄一封重設連結給你</p>
        </div>

        {sentMessage ? (
          <div className="surface space-y-4 p-5 text-center shadow-md">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-orange-bg text-orange">
              <MailCheck size={22} />
            </span>
            <p className="text-[13px] leading-6 text-[var(--gray-600)]">{sentMessage}</p>
            <p className="text-[12px] leading-5 text-[var(--gray-400)]">連結 60 分鐘內有效，而且只能使用一次。</p>
            <Link className="btn btn-primary w-full" href="/login">
              回到登入
            </Link>
          </div>
        ) : (
          <div className="surface space-y-3.5 p-5 shadow-md">
            <label className="grid gap-1.5 text-sm">
              <span className="text-[13px] text-[var(--gray-500)]">Email</span>
              <input
                className="field"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (error) setError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
                placeholder="you@example.com"
              />
            </label>

            {error && (
              <div className="rounded-md border border-[var(--red)]/30 bg-[var(--red-bg)] p-3 text-[13px] leading-6 text-[var(--red)]" role="alert">
                {error}
              </div>
            )}

            <button className="btn btn-primary w-full" disabled={loading || !email.trim()} onClick={submit} type="button">
              {loading && <Loader2 size={15} className="animate-spin" />}
              寄送重設連結
            </button>

            <p className="text-center text-[13px] text-[var(--gray-500)]">
              想起來了？{" "}
              <Link className="text-orange" href="/login">
                回到登入
              </Link>
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
