"use client";

import { Check, Menu, Pencil, Plus, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type ProjectListItem = {
  id: string;
  title: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  status: string;
  progress: number;
  updatedAt: string;
};

function projectDisplayTitle(project: Pick<ProjectListItem, "title">) {
  const title = project.title?.trim();
  if (!title || title === "AI 分析中") return "未命名專案";
  const legacyGeneratedTitlePrefixes = ["服務業反轉爽劇", "孩子偏心爸爸的花", "髮型與整體造型是"];
  if (legacyGeneratedTitlePrefixes.some((prefix) => title.startsWith(prefix))) return "未命名專案";
  return title;
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [editingId, setEditingId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [savingId, setSavingId] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeProjectId = pathname.match(/^\/projects\/([^/]+)/)?.[1] || "";

  async function loadProjects() {
    const res = await fetch("/api/projects");
    const data = await res.json();
    if (res.ok) setProjects(data.projects || []);
  }

  useEffect(() => {
    loadProjects();
  }, [pathname]);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("lurevid-sidebar-collapsed") === "true");
  }, []);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("lurevid-sidebar-collapsed", String(next));
      return next;
    });
  }

  function beginEdit(project: ProjectListItem) {
    setEditingId(project.id);
    setDraftTitle(projectDisplayTitle(project));
  }

  function closeMobileMenu() {
    setMobileOpen(false);
  }

  async function saveTitle(projectId: string) {
    const title = draftTitle.trim();
    if (!title) return;
    setSavingId(projectId);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      if (res.ok) {
        setEditingId("");
        await loadProjects();
      }
    } finally {
      setSavingId("");
    }
  }

  async function deleteProject(project: ProjectListItem) {
    if (!window.confirm(`刪除「${projectDisplayTitle(project)}」？這會移除分析、分鏡與影片紀錄。`)) return;

    setSavingId(project.id);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (res.ok) {
        if (activeProjectId === project.id) router.push("/");
        await loadProjects();
      }
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="min-h-screen">
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--border)] bg-white px-3 md:hidden">
        <button className="grid h-10 w-10 place-items-center rounded-xl text-[var(--gray-500)]" onClick={() => setMobileOpen(true)} title="開啟選單">
          <Menu size={19} />
        </button>
        <img className="h-6 w-auto max-w-[118px]" src="/logo.svg" alt="lurevid" />
        <Link className="grid h-10 w-10 place-items-center rounded-xl text-orange" href="/" title="新增專案">
          <Plus size={18} />
        </Link>
      </div>
      {mobileOpen && <button className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={closeMobileMenu} aria-label="關閉選單" />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[min(82vw,300px)] flex-col border-r border-[var(--border)] bg-white transition-transform duration-200 md:z-40 md:translate-x-0 md:transition-[width] ${mobileOpen ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "md:w-16" : "md:w-[var(--sidebar-w)]"}`}>
        <div className={`flex h-[60px] items-center border-b border-[var(--border)] ${collapsed ? "md:justify-center md:px-2" : "justify-between px-5"}`}>
          {!collapsed && <img className="h-6 w-auto max-w-[132px]" src="/logo.svg" alt="lurevid" />}
          <button className="hidden h-9 w-9 place-items-center rounded-xl text-[var(--gray-500)] hover:bg-orange-bg hover:text-orange md:grid" onClick={toggleSidebar} title={collapsed ? "展開選單" : "收合選單"}>
            <Menu size={18} />
          </button>
          <button className="grid h-9 w-9 place-items-center rounded-xl text-[var(--gray-500)] md:hidden" onClick={closeMobileMenu} title="關閉選單">
            <X size={18} />
          </button>
        </div>
        <nav className={`flex min-h-0 flex-1 flex-col p-3 ${collapsed ? "md:p-2" : "md:p-3"}`}>
          <div className="space-y-1">
            <Link
              className={`flex items-center rounded-xl py-3 text-sm ${collapsed ? "gap-3 px-3 md:justify-center md:px-0" : "gap-3 px-3"} ${pathname === "/" ? "bg-orange-bg text-orange" : "text-[var(--gray-500)] hover:bg-orange-bg hover:text-orange"}`}
              href="/"
              onClick={closeMobileMenu}
              title="新增專案"
            >
              <Plus size={17} />
              <span className={collapsed ? "md:hidden" : ""}>新增專案</span>
            </Link>
          </div>

          <div className={`mt-4 min-h-0 flex-1 border-t border-[var(--border)] pt-3 ${collapsed ? "md:hidden" : ""}`}>
            <div className="mb-2 flex items-center justify-between px-2">
              <div className="text-[11px] uppercase tracking-wide text-[var(--gray-500)]">專案</div>
              <span className="text-[11px] text-[var(--gray-300)]">{projects.length}</span>
            </div>
            <div className="max-h-[calc(100vh-170px)] space-y-0.5 overflow-y-auto pr-1">
              {projects.length === 0 && <div className="rounded-xl bg-[var(--warm-white)] px-3 py-3 text-xs leading-5 text-[var(--gray-500)]">開始分析後，專案會自動存到這裡。</div>}
              {projects.map((project) => {
                const active = activeProjectId === project.id;
                const editing = editingId === project.id;

                return (
                  <div className={`rounded-lg px-2 py-1 ${active ? "bg-orange-bg" : "hover:bg-[var(--warm-white)]"}`} key={project.id}>
                    {editing ? (
                      <div className="flex items-start gap-1">
                        <input
                          className="min-w-0 flex-1 rounded-md border border-[var(--border-strong)] bg-white px-2 py-1 text-xs outline-none focus:border-orange"
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") saveTitle(project.id);
                            if (event.key === "Escape") setEditingId("");
                          }}
                          autoFocus
                        />
                        <button className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-orange text-white" disabled={savingId === project.id} onClick={() => saveTitle(project.id)} title="儲存名稱">
                          <Check size={13} />
                        </button>
                        <button className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-[var(--border-strong)] bg-white text-[var(--gray-500)]" onClick={() => setEditingId("")} title="取消">
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Link className="block min-w-0 flex-1 py-1" href={`/projects/${project.id}`} onClick={closeMobileMenu}>
                          <div className={`truncate text-xs leading-5 ${active ? "text-orange" : "text-[var(--black)]"}`}>{projectDisplayTitle(project)}</div>
                        </Link>
                        <div className="flex shrink-0 gap-1">
                          <button className="grid h-6 w-6 place-items-center text-[var(--gray-300)] hover:text-[var(--gray-400)]" disabled={savingId === project.id} onClick={() => beginEdit(project)} title="編輯名稱">
                            <Pencil size={11} />
                          </button>
                          <button className="grid h-6 w-6 place-items-center text-[var(--gray-300)] hover:text-[var(--gray-400)]" disabled={savingId === project.id} onClick={() => deleteProject(project)} title="刪除專案">
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <Link
              className={`flex items-center rounded-xl py-3 text-sm ${collapsed ? "gap-3 px-3 md:justify-center md:px-0" : "gap-3 px-3"} ${pathname === "/settings" ? "bg-orange-bg text-orange" : "text-[var(--gray-500)] hover:bg-orange-bg hover:text-orange"}`}
              href="/settings"
              onClick={closeMobileMenu}
              title="設定"
            >
              <Settings size={17} />
              <span className={collapsed ? "md:hidden" : ""}>設定</span>
            </Link>
          </div>
        </nav>
      </aside>
      <main className={`pt-14 transition-[margin] duration-200 md:pt-0 ${collapsed ? "md:ml-16" : "md:ml-[var(--sidebar-w)]"}`}>{children}</main>
    </div>
  );
}
