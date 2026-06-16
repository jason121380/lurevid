"use client";

import { Check, X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastType = "success" | "error";
type ToastItem = { id: number; message: string; type: ToastType };

const ToastContext = createContext<(message: string, type?: ToastType) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, type: ToastType = "success") => {
    if (!message) return;
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, message, type }]);
    setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 2800);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(380px,calc(100vw-32px))] flex-col items-stretch gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3 text-sm shadow-[0_18px_60px_rgb(26_26_26/0.16)] ${
              item.type === "error" ? "border-[var(--red)] text-[var(--red)]" : "border-[var(--orange-border)] text-[var(--black)]"
            }`}
            role="status"
          >
            <span
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg ${
                item.type === "error" ? "bg-[var(--red-bg)] text-[var(--red)]" : "bg-orange-bg text-orange"
              }`}
            >
              {item.type === "error" ? <X size={14} /> : <Check size={14} />}
            </span>
            <span className="min-w-0 flex-1 leading-6">{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
