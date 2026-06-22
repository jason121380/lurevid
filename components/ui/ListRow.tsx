"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type ListRowProps = {
  href?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
};

function RowInner({ leading, title, subtitle, trailing, chevron = true }: Omit<ListRowProps, "href" | "onClick" | "onMouseEnter">) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] leading-snug text-[var(--black)]">{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-[12px] leading-snug text-[var(--gray-400)]">{subtitle}</div>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
      {chevron && <ChevronRight size={18} className="shrink-0 text-[var(--gray-300)]" />}
    </div>
  );
}

export function ListRow({ href, onClick, onMouseEnter, ...inner }: ListRowProps) {
  const base = "block w-full text-left transition active:bg-[var(--surface-muted)] hover:bg-[var(--surface-muted)]/60";
  if (href) {
    return (
      <Link href={href} onClick={onClick} onMouseEnter={onMouseEnter} className={base}>
        <RowInner {...inner} />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} onMouseEnter={onMouseEnter} className={base}>
      <RowInner {...inner} />
    </button>
  );
}

export function ListGroup({ children }: { children: ReactNode }) {
  return <div className="surface divide-y divide-[var(--border)] overflow-hidden">{children}</div>;
}
