"use client";

import { Activity, BarChart3, Clapperboard, Home, ImageIcon, Layers, LogOut, Settings, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

type NavItem = { href: string; label: string; icon: ComponentType<{ size?: number }>; match: (path: string) => boolean };

const MAIN_ITEMS: NavItem[] = [
  { href: "/", label: "首頁", icon: Home, match: (p) => p === "/" },
  { href: "/projects", label: "專案", icon: Layers, match: (p) => p === "/projects" || p.startsWith("/projects/") },
  { href: "/me", label: "我的", icon: User, match: (p) => p === "/me" }
];

const QUICK_ITEMS: NavItem[] = [
  { href: "/quick/image", label: "文生圖", icon: ImageIcon, match: (p) => p === "/quick/image" },
  { href: "/quick/video", label: "文生影片", icon: Clapperboard, match: (p) => p === "/quick/video" }
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/health", label: "健康檢查", icon: Activity, match: (p) => p === "/health" },
  { href: "/usage", label: "用量", icon: BarChart3, match: (p) => p === "/usage" },
  { href: "/settings", label: "設定", icon: Settings, match: (p) => p === "/settings" }
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] transition ${
        active ? "bg-orange-bg font-medium text-orange" : "text-[var(--gray-600)] hover:bg-[var(--surface-muted)]"
      }`}
    >
      <Icon size={18} />
      {item.label}
    </Link>
  );
}

/** 桌機（lg 以上）的固定左側導覽；手機/平板改用底部分頁列。 */
export function SideNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = Boolean(session?.user?.isAdmin);
  const email = session?.user?.email || "";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-sidenav flex-col border-r border-[var(--border)] bg-[var(--surface)] lg:flex">
      <div className="flex h-appbar-lg shrink-0 items-center px-5">
        <Link href="/" title="lurevid">
          <Image className="h-6 w-auto" src="/logo.svg" alt="lurevid" width={132} height={28} priority />
        </Link>
      </div>

      <nav aria-label="主要導覽" className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {MAIN_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={item.match(pathname)} />
        ))}

        <div className="px-3 pb-1 pt-5 text-[11px] font-medium uppercase tracking-wide text-[var(--gray-400)]">快速使用</div>
        {QUICK_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={item.match(pathname)} />
        ))}

        {isAdmin && (
          <>
            <div className="px-3 pb-1 pt-5 text-[11px] font-medium uppercase tracking-wide text-[var(--gray-400)]">管理員</div>
            {ADMIN_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} active={item.match(pathname)} />
            ))}
          </>
        )}
      </nav>

      <div className="shrink-0 border-t border-[var(--border)] p-3">
        <div className="flex items-center gap-2.5 px-2 pb-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-orange text-[13px] font-semibold text-white">
            {(email[0] || "?").toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--gray-500)]" title={email}>
            {email || "未登入"}
          </span>
        </div>
        <button
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] text-[var(--gray-500)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--gray-600)]"
          onClick={() => signOut({ callbackUrl: "/login" })}
          type="button"
        >
          <LogOut size={16} />
          登出
        </button>
      </div>
    </aside>
  );
}
