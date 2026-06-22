"use client";

import { Check, Loader2, X } from "lucide-react";
import { useEffect, useRef, type ComponentType } from "react";

export type StepperState = "project" | "done" | "active" | "failed" | "waiting";

export type StepperItem = {
  key: string | number;
  label: string;
  number?: number;
  icon: ComponentType<{ size?: number; className?: string }>;
  state: StepperState;
};

function Dot({ item }: { item: StepperItem }) {
  const { state, icon: Icon } = item;
  const cls =
    state === "failed"
      ? "border-[var(--red)] bg-[var(--red-bg)] text-[var(--red)]"
      : state === "done" || state === "project"
        ? "border-orange bg-orange text-white"
        : state === "active"
          ? "border-orange bg-orange-bg text-orange"
          : "border-[var(--gray-200)] bg-white text-[var(--gray-300)]";

  return (
    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${cls} ${state === "active" ? "pulse-ring" : ""}`}>
      {state === "active" ? <Loader2 size={11} className="animate-spin" /> : state === "failed" ? <X size={11} /> : state === "done" ? <Check size={11} /> : <Icon size={11} />}
    </span>
  );
}

export function Stepper({
  items,
  activeKey,
  onSelect
}: {
  items: StepperItem[];
  activeKey: string | number;
  onSelect: (key: string | number) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const node = activeRef.current;
    if (node) node.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeKey]);

  return (
    <div ref={railRef} className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 py-2">
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={String(item.key)}
            ref={active ? activeRef : undefined}
            onClick={() => onSelect(item.key)}
            type="button"
            aria-current={active ? "step" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 transition ${
              active
                ? "border-[var(--orange-border)] bg-orange-bg text-orange"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--gray-600)] hover:border-[var(--border-strong)]"
            }`}
          >
            <Dot item={item} />
            <span className="whitespace-nowrap text-[13px] leading-none">
              {item.number ? <span className="tabular-nums">{item.number}. </span> : null}
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
