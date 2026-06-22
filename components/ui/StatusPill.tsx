"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export type PillTone = "ok" | "warn" | "error" | "neutral";

const TONE_CLASS: Record<PillTone, string> = {
  ok: "bg-[var(--green-bg)] text-[var(--green)]",
  warn: "bg-orange-bg text-orange",
  error: "bg-[var(--red-bg)] text-[var(--red)]",
  neutral: "bg-[var(--surface-muted)] text-[var(--gray-500)]"
};

export function StatusPill({
  tone = "neutral",
  children,
  spinning = false
}: {
  tone?: PillTone;
  children: ReactNode;
  spinning?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium leading-none ${TONE_CLASS[tone]}`}>
      {spinning && <Loader2 size={11} className="animate-spin" />}
      {children}
    </span>
  );
}
