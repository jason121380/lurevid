"use client";

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
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex max-w-[90vw] -translate-x-1/2 flex-col items-center gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto rounded-full px-4 py-2 text-sm text-white shadow-lg ${item.type === "error" ? "bg-[var(--red)]" : "bg-[var(--black)]"}`}
            role="status"
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
