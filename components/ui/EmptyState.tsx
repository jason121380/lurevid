"use client";

import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  icon,
  action
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-6 text-center md:min-h-[260px]">
      <div className="flex flex-col items-center">
        {icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-orange-bg text-orange">{icon}</div>}
        <h3 className="text-[15px] font-medium text-[var(--black)]">{title}</h3>
        {description && <p className="mt-2 max-w-md text-[13px] leading-6 text-[var(--gray-500)]">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
