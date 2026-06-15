"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!email.trim() || password.length < 8) {
      setError("請輸入 Email，密碼至少 8 個字元");
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
        setError(data.error || "註冊失敗");
        return;
      }
      const signInResult = await signIn("credentials", { email: email.trim(), password, redirect: false });
      if (signInResult?.error) {
        router.push("/login");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("註冊失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--warm-white)] p-4">
      <section className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img className="mx-auto h-7 w-auto" src="/logo.svg" alt="lurevid" />
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
