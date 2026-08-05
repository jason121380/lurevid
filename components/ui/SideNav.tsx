"use client";

import { Clapperboard, Home, ImageIcon, Layers, LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

type NavItem = { href: string; label: string; icon: ComponentType<{ size?: number }>; match: (path: string) => boolean };

const MAIN_ITEMS: NavItem[] = [
  { href: "/", label: "首頁", icon: Home, match: (p) => p === "/" },
  { href: "/projects", label: "專案", icon: Layers, match: (p) => p === "/projects" || p.startsWith("/projects/") }
];

const QUICK_ITEMS: NavItem[] = [
  { href: "/quick/image", label: "文生圖", icon: ImageIcon, match: (p) => p === "/quick/image" },
  { href: "/quick/video", label: "文生影片", icon: Clapperboard, match: (p) => p === "/quick/video" }
];

// 健康檢查／用量／設定都是從「我的」進去的，所以停在那些頁面時帳號列要維持作用中，
// 否則側欄會整個沒有選取項目。與底部分頁列的判定一致。
const ACCOUNT_PATHS = ["/me", "/settings", "/usage", "/health"];

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
  const email = session?.user?.email || "";
  const accountActive = ACCOUNT_PATHS.includes(pathname);

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
      </nav>

      {/* 帳號列是「我的」的入口；健康檢查／用量／設定都在那一頁裡，側欄不重複列出。 */}
      <div className="shrink-0 border-t border-[var(--border)] p-3">
        <div className="flex items-center gap-1">
          <Link
            href="/me"
            aria-current={accountActive ? "page" : undefined}
            className={`min-w-0 flex-1 truncate rounded-md px-3 py-2.5 text-[13px] transition ${
              accountActive
                ? "bg-orange-bg font-medium text-orange"
                : "text-[var(--gray-600)] hover:bg-[var(--surface-muted)]"
            }`}
            title={email || "未登入"}
          >
            {email || "未登入"}
          </Link>
          {/* 只有圖示，所以 aria-label 是螢幕閱讀器唯一的線索。 */}
          <button
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--gray-400)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--gray-600)]"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="登出"
            aria-label="登出"
            type="button"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
