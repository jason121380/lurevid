"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-float animate-fade-in-up pb-safe-bottom sm:rounded-2xl sm:pb-5"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-[var(--black)]">{title}</h2>
            <button
              className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--gray-400)] hover:bg-[var(--surface-muted)] hover:text-[var(--black)]"
              onClick={onClose}
              type="button"
              aria-label="關閉"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {children}
        {footer && <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}
