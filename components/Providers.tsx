"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { PwaRegister } from "@/components/PwaRegister";
import { ToastProvider } from "@/components/Toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <PwaRegister />
        {children}
      </ToastProvider>
    </SessionProvider>
  );
}
