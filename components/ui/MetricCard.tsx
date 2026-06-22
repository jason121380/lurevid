"use client";

import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  sub,
  tone = "default"
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "accent";
}) {
  return (
    <div className={`rounded-lg border p-4 ${tone === "accent" ? "border-[var(--orange-border)] bg-orange-bg" : "border-[var(--border)] bg-[var(--surface)]"}`}>
      <div className="text-[12px] text-[var(--gray-500)]">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${tone === "accent" ? "text-orange" : "text-[var(--black)]"}`}>{value}</div>
      {sub && <div className="mt-1 text-[12px] leading-5 text-[var(--gray-400)]">{sub}</div>}
    </div>
  );
}
