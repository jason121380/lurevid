"use client";

import { Home, Layers, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; icon: typeof Home; match: (path: string) => boolean };

const TABS: Tab[] = [
  { href: "/", label: "首頁", icon: Home, match: (p) => p === "/" },
  { href: "/projects", label: "專案", icon: Layers, match: (p) => p === "/projects" || p.startsWith("/projects/") },
  { href: "/me", label: "我的", icon: User, match: (p) => p === "/me" || p === "/settings" || p === "/usage" || p === "/health" }
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="主要導覽"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-md pb-safe-bottom
                 md:inset-x-auto md:bottom-6 md:left-1/2 md:w-auto md:-translate-x-1/2 md:rounded-full md:border md:pb-0 md:shadow-float"
    >
      <ul className="mx-auto flex h-tabbar max-w-content items-stretch justify-around md:h-auto md:gap-1 md:p-1.5">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex flex-1 md:flex-none">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-1 transition
                            md:flex-row md:gap-2 md:rounded-full md:px-5 md:py-2.5
                            ${active ? "text-orange md:bg-orange-bg" : "text-[var(--gray-400)] hover:text-[var(--gray-600)]"}`}
              >
                <Icon size={21} className={active ? "scale-105" : ""} strokeWidth={active ? 2.4 : 2} />
                <span className={`text-[11px] leading-none md:text-[13px] ${active ? "font-medium" : ""}`}>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
