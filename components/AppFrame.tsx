"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { SideNav } from "@/components/ui/SideNav";

const plainRoutes = new Set(["/login", "/register"]);

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // 登入/註冊：無外框。
  if (plainRoutes.has(pathname)) return <>{children}</>;

  // 專案工作區（/projects/<id>）：全螢幕、沉浸式。手機有自己的底部動作列、
  // 桌機有自己的步驟側欄，兩者都不需要外層導覽。
  const isProjectDetail = /^\/projects\/[^/]+$/.test(pathname);
  if (isProjectDetail) return <>{children}</>;

  // 其餘畫面：桌機用固定左側導覽，手機/平板用底部分頁列（底部留白清開分頁列）。
  return (
    <div className="min-h-dvh pb-[calc(var(--tabbar-h)+var(--safe-bottom)+16px)] lg:pb-0 lg:pl-sidenav">
      <SideNav />
      {children}
      <BottomTabBar />
    </div>
  );
}
