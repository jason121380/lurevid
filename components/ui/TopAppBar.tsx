"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

type TopAppBarProps = {
  title: string;
  subtitle?: string;
  /** 顯示返回鍵；true 時用 router.back()，字串時當作 href。 */
  back?: boolean | string;
  right?: ReactNode;
  /** 標題對齊，預設置中（更像原生 App）。有 right 內容時建議靠左。 */
  align?: "center" | "left";
};

export function TopAppBar({ title, subtitle, back, right, align = "center" }: TopAppBarProps) {
  const router = useRouter();
  const showBack = Boolean(back);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/85 backdrop-blur-md pt-safe-top">
      <div
        className="mx-auto flex h-appbar max-w-content-wide items-center gap-2 px-3"
      >
        {showBack && (
          <button
            className="-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--gray-600)] transition hover:bg-[var(--surface-muted)]"
            onClick={() => (typeof back === "string" ? router.push(back) : router.back())}
            title="返回"
            type="button"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <div className={`min-w-0 flex-1 ${align === "center" && !showBack && !right ? "text-center" : ""}`}>
          <h1 className="truncate text-[15px] font-semibold leading-tight text-[var(--black)]">{title}</h1>
          {subtitle && <p className="truncate text-[11px] leading-tight text-[var(--gray-400)]">{subtitle}</p>}
        </div>
        {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
      </div>
    </header>
  );
}
