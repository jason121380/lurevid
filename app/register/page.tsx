"use client";

import { Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useToast } from "@/components/Toast";

export default function RegisterPage() {
  const toast = useToast();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!email.trim() || password.length < 8) {
      const message = "請輸入 Email，密碼至少 8 個字元";
      setError(message);
      toast(message, "error");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() || undefined })
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data.error || "註冊失敗";
        setError(message);
        toast(message, "error");
        return;
      }
      const signInResult = await signIn("credentials", { email: email.trim(), password, redirect: false });
      if (signInResult?.error) {
        toast("註冊成功，請登入");
        router.push("/login");
        return;
      }
      toast("註冊成功");
      router.push("/");
      router.refresh();
    } catch {
      const message = "註冊失敗，請稍後再試";
      setError(message);
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-start bg-[var(--warm-white)] p-4 pt-[clamp(48px,10dvh,96px)] sm:place-items-center sm:pt-4">
      <section className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Image className="mx-auto h-7 w-auto" src="/logo.svg" alt="lurevid" width={132} height={28} priority />
          <h1 className="mt-4 text-lg text-[var(--black)]">註冊 lurevid</h1>
        </div>
        <div className="card space-y-3 p-5">
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--gray-500)]">名稱（選填）</span>
            <input
              className="rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-orange"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--gray-500)]">Email</span>
            <input
              className="rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-orange"
              type="email"
              inputMode="email"
              enterKeyHint="next"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--gray-500)]">密碼（至少 8 字元）</span>
            <input
              className="rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-orange"
              type="password"
              enterKeyHint="go"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submit()}
              autoComplete="new-password"
            />
          </label>
          {error && <p className="rounded-lg bg-[var(--red-bg)] px-3 py-2 text-xs text-[var(--red)]">{error}</p>}
          <button className="btn btn-primary w-full justify-center" disabled={loading} onClick={submit} type="button">
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? "註冊中" : "註冊"}
          </button>
          <p className="text-center text-xs text-[var(--gray-500)]">
            已經有帳號？{" "}
            <Link className="text-orange underline" href="/login">
              登入
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
