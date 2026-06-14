"use client";

import { Check, LayoutDashboard, Pencil, Trash2, X } from "lucide-react";
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

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [editingId, setEditingId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [savingId, setSavingId] = useState("");
  const activeProjectId = pathname.match(/^\/projects\/([^/]+)/)?.[1] || "";

  async function loadProjects() {
    const res = await fetch("/api/projects");
    const data = await res.json();
    if (res.ok) setProjects(data.projects || []);
  }

  useEffect(() => {
    loadProjects();
  }, [pathname]);

  function beginEdit(project: ProjectListItem) {
    setEditingId(project.id);
    setDraftTitle(project.title || "未命名專案");
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
    if (!window.confirm(`刪除「${project.title || "未命名專案"}」？這會移除分析、分鏡與影片紀錄。`)) return;

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
      <aside className="fixed inset-y-0 left-0 flex w-[var(--sidebar-w)] flex-col border-r border-[var(--border)] bg-white">
        <div className="flex h-[60px] items-center gap-2 border-b border-[var(--border)] px-5">
          <div className="text-sm text-[var(--black)]">lurevid</div>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col p-3">
          <div className="space-y-1">
            <Link
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${pathname === "/" ? "bg-orange-bg text-orange" : "text-[var(--gray-500)] hover:bg-orange-bg hover:text-orange"}`}
              href="/"
            >
              <LayoutDashboard size={17} />
              新增專案
            </Link>
          </div>

          <div className="mt-4 min-h-0 flex-1 border-t border-[var(--border)] pt-3">
            <div className="mb-2 flex items-center justify-between px-2">
              <div className="text-[11px] uppercase tracking-wide text-[var(--gray-500)]">專案</div>
              <span className="text-[11px] text-[var(--gray-300)]">{projects.length}</span>
            </div>
            <div className="max-h-[calc(100vh-170px)] space-y-1 overflow-y-auto pr-1">
              {projects.length === 0 && <div className="rounded-xl bg-[var(--warm-white)] px-3 py-3 text-xs leading-5 text-[var(--gray-500)]">開始分析後，專案會自動存到這裡。</div>}
              {projects.map((project) => {
                const active = activeProjectId === project.id;
                const editing = editingId === project.id;

                return (
                  <div className={`rounded-xl p-2 ${active ? "bg-orange-bg" : "hover:bg-[var(--warm-white)]"}`} key={project.id}>
                    {editing ? (
                      <div className="flex items-start gap-1">
                        <input
                          className="min-w-0 flex-1 rounded-lg border border-[var(--border-strong)] bg-white px-2 py-1 text-xs outline-none focus:border-orange"
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") saveTitle(project.id);
                            if (event.key === "Escape") setEditingId("");
                          }}
                          autoFocus
                        />
                        <button className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-orange text-white" disabled={savingId === project.id} onClick={() => saveTitle(project.id)} title="儲存名稱">
                          <Check size={14} />
                        </button>
                        <button className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--border-strong)] bg-white text-[var(--gray-500)]" onClick={() => setEditingId("")} title="取消">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start gap-1">
                        <Link className="block min-w-0 flex-1 py-1" href={`/projects/${project.id}`}>
                          <div className={`truncate text-sm ${active ? "text-orange" : "text-[var(--black)]"}`}>{project.title || "AI 分析中"}</div>
                        </Link>
                        <div className="flex shrink-0 gap-1">
                          <button className="grid h-7 w-7 place-items-center rounded-lg text-[var(--gray-500)] hover:bg-white hover:text-orange" disabled={savingId === project.id} onClick={() => beginEdit(project)} title="編輯名稱">
                            <Pencil size={13} />
                          </button>
                          <button className="grid h-7 w-7 place-items-center rounded-lg text-[var(--gray-500)] hover:bg-white hover:text-[var(--red)]" disabled={savingId === project.id} onClick={() => deleteProject(project)} title="刪除專案">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </nav>
      </aside>
      <main className="ml-[var(--sidebar-w)]">{children}</main>
    </div>
  );
}
