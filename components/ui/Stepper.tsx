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

const STATE_LABEL: Record<StepperState, string> = {
  project: "",
  done: "完成",
  active: "執行中",
  failed: "失敗",
  waiting: "等待中"
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
  onSelect,
  orientation = "horizontal"
}: {
  items: StepperItem[];
  activeKey: string | number;
  onSelect: (key: string | number) => void;
  /** horizontal：手機的橫向膠囊列；vertical：桌機的步驟側欄。 */
  orientation?: "horizontal" | "vertical";
}) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const vertical = orientation === "vertical";

  useEffect(() => {
    // 只有橫向膠囊列需要把目前步驟捲進畫面；直向側欄一次就看得完。
    if (vertical) return;
    const node = activeRef.current;
    if (node) node.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeKey, vertical]);

  if (vertical) {
    return (
      <nav aria-label="處理步驟" className="flex flex-col gap-1">
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <button
              key={String(item.key)}
              onClick={() => onSelect(item.key)}
              type="button"
              aria-current={active ? "step" : undefined}
              className={`flex w-full items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition ${
                active
                  ? "border-[var(--orange-border)] bg-orange-bg text-orange"
                  : "border-transparent text-[var(--gray-600)] hover:bg-[var(--surface-muted)]"
              }`}
            >
              <Dot item={item} />
              <span className="min-w-0 flex-1 truncate text-[14px] leading-tight">
                {item.number ? <span className="tabular-nums text-[var(--gray-400)]">{item.number}. </span> : null}
                {item.label}
              </span>
              {item.state !== "project" && (
                <span
                  className={`shrink-0 text-[11px] ${
                    item.state === "failed"
                      ? "text-[var(--red)]"
                      : item.state === "done"
                        ? "text-[var(--green)]"
                        : item.state === "active"
                          ? "text-orange"
                          : "text-[var(--gray-300)]"
                  }`}
                >
                  {STATE_LABEL[item.state]}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 py-2">
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
