import { LayoutDashboard, Sparkles } from "lucide-react";
import Link from "next/link";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-[var(--sidebar-w)] border-r border-[var(--border)] bg-white lg:flex lg:flex-col">
        <div className="flex h-[60px] items-center gap-2 border-b border-[var(--border)] px-5">
          <div className="text-sm text-[var(--black)]">lurevid</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <Link className="flex items-center gap-3 rounded-xl bg-orange-bg px-3 py-3 text-sm text-orange" href="/">
            <LayoutDashboard size={17} />
            工作台
          </Link>
        </nav>
        <div className="border-t border-[var(--border)] p-4">
          <div className="flex items-center gap-3 rounded-xl bg-[var(--warm-white)] p-3">
            <Sparkles size={18} className="text-orange" />
            <div>
              <div className="text-xs">OpenAI + Seedance</div>
              <div className="text-[11px] text-[var(--gray-500)]">9-shot video workflow</div>
            </div>
          </div>
        </div>
      </aside>
      <main className="lg:ml-[var(--sidebar-w)]">{children}</main>
    </div>
  );
}
