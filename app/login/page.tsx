"use client";

import { Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { useToast } from "@/components/Toast";

function LoginForm() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!email.trim() || !password) return;
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false
      });
      if (res?.error) {
        const message = "Email 或密碼不正確";
        setError(message);
        toast(message, "error");
        return;
      }
      toast("登入成功");
      router.push(callbackUrl);
      router.refresh();
    } catch {
      const message = "登入失敗，請稍後再試";
      setError(message);
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-start bg-[var(--warm-white)] p-4 pt-[clamp(56px,12dvh,120px)] sm:place-items-center sm:pt-4">
      <section className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Image className="mx-auto h-7 w-auto" src="/logo.svg" alt="lurevid" width={132} height={28} priority />
          <h1 className="mt-4 text-lg text-[var(--black)]">登入 lurevid</h1>
        </div>
        <div className="card space-y-3 p-5">
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--gray-500)]">Email</span>
            <input
              className="rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-orange"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submit()}
              autoComplete="email"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--gray-500)]">密碼</span>
            <input
              className="rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-orange"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submit()}
              autoComplete="current-password"
            />
          </label>
          {error && <p className="rounded-lg bg-[var(--red-bg)] px-3 py-2 text-xs text-[var(--red)]">{error}</p>}
          <button className="btn btn-primary w-full justify-center" disabled={loading || !email.trim() || !password} onClick={submit} type="button">
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? "登入中" : "登入"}
          </button>
          <p className="text-center text-xs text-[var(--gray-500)]">
            還沒有帳號？{" "}
            <Link className="text-orange underline" href="/register">
              註冊
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center"><Loader2 className="animate-spin text-orange" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
