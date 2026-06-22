"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BottomTabBar } from "@/components/ui/BottomTabBar";

const plainRoutes = new Set(["/login", "/register"]);

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // 登入/註冊：無外框。
  if (plainRoutes.has(pathname)) return <>{children}</>;

  // 專案工作區（/projects/<id>）：全螢幕、沉浸式，不顯示底部分頁列（它有自己的底部動作列）。
  const isProjectDetail = /^\/projects\/[^/]+$/.test(pathname);
  if (isProjectDetail) return <>{children}</>;

  // 其餘畫面：內容區 + 底部分頁列，底部留白清開分頁列。
  return (
    <div className="min-h-dvh pb-[calc(var(--tabbar-h)+var(--safe-bottom)+16px)]">
      {children}
      <BottomTabBar />
    </div>
  );
}
