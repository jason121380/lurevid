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
    <div className="grid min-h-dvh place-items-start bg-[var(--warm-white)] p-5 pt-[clamp(56px,12dvh,120px)] sm:place-items-center sm:pt-5">
      <section className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <Image className="mx-auto h-7 w-auto" src="/logo.svg" alt="lurevid" width={132} height={28} priority />
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-[var(--black)]">註冊 lurevid</h1>
          <p className="mt-1.5 text-[13px] text-[var(--gray-500)]">建立帳號，開始分析你的第一支影片</p>
        </div>
        <div className="surface space-y-3.5 p-5 shadow-md">
          <label className="grid gap-1.5 text-sm">
            <span className="text-[13px] text-[var(--gray-500)]">名稱（選填）</span>
            <input
              className="field"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-[13px] text-[var(--gray-500)]">Email</span>
            <input
              className="field"
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
          <label className="grid gap-1.5 text-sm">
            <span className="text-[13px] text-[var(--gray-500)]">密碼（至少 8 字元）</span>
            <input
              className="field"
              type="password"
              enterKeyHint="go"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submit()}
              autoComplete="new-password"
            />
          </label>
          {error && <p className="rounded-md bg-[var(--red-bg)] px-3 py-2 text-[12px] text-[var(--red)]">{error}</p>}
          <button className="btn btn-primary w-full" disabled={loading} onClick={submit} type="button">
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? "註冊中" : "註冊"}
          </button>
          <p className="text-center text-[13px] text-[var(--gray-500)]">
            已經有帳號？{" "}
            <Link className="font-medium text-orange" href="/login">
              登入
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
