"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";

const plainRoutes = new Set(["/login", "/register"]);

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (plainRoutes.has(pathname)) return <>{children}</>;
  return <Shell>{children}</Shell>;
}
