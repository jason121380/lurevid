"use client";

import { Activity, BarChart3, Loader2, LogOut, Menu, Plus, Settings, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

type ProjectListItem = {
  id: string;
  title: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  status: string;
  progress: number;
  steps?: Record<string, { status?: string; progress?: number; message?: string }>;
  updatedAt: string;
};

const PROJECT_BUSY_STATUSES = ["QUEUED", "ANALYZING", "STRUCTURING", "ADAPTING", "STORYBOARDING", "GENERATING", "MERGING"];
const PROJECT_STEP_LABELS: Array<[string, string]> = [
  ["source", "影片下載"],
  ["transcribe", "轉錄音訊"],
  ["frames", "抽取影格"],
  ["analyze", "影片分析"],
  ["adapt", "改編腳本"],
  ["storyboard", "產生分鏡"],
  ["mergeStoryboard", "合併分鏡"],
  ["video", "生成影片"]
];

function projectDisplayTitle(project: Pick<ProjectListItem, "title">) {
  const title = project.title?.trim();
  if (!title || title === "AI 分析中") return "未命名專案";
  const legacyGeneratedTitlePrefixes = ["服務業反轉爽劇", "孩子偏心爸爸的花", "髮型與整體造型是"];
  if (legacyGeneratedTitlePrefixes.some((prefix) => title.startsWith(prefix))) return "未命名專案";
  return title;
}

function runningProjectLabel(project: ProjectListItem) {
  const runningStep = PROJECT_STEP_LABELS.find(([key]) => project.steps?.[key]?.status === "running");
  if (runningStep) return runningStep[1];

  switch (project.status) {
    case "QUEUED":
      return "排隊中";
    case "ANALYZING":
      return "影片分析";
    case "STRUCTURING":
    case "ADAPTING":
      return "改編腳本";
    case "STORYBOARDING":
      return "產生分鏡";
    case "GENERATING":
    case "MERGING":
      return "生成影片";
    default:
      return "";
  }
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const { data: session } = useSession();
  const isAdmin = Boolean(session?.user?.isAdmin);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [switchingProjectId, setSwitchingProjectId] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeProjectId = pathname.match(/^\/projects\/([^/]+)/)?.[1] || "";
  const switchingProject = switchingProjectId && switchingProjectId !== activeProjectId;

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (res.ok) setProjects(data.projects || []);
      else toast(data.error || "讀取專案列表失敗", "error");
    } catch {
      toast("讀取專案列表失敗", "error");
    }
  }, [toast]);

  useEffect(() => {
    loadProjects();
    window.addEventListener("lurevid:projects-changed", loadProjects);
    return () => window.removeEventListener("lurevid:projects-changed", loadProjects);
  }, [loadProjects]);

  useEffect(() => {
    function applyOptimisticProject(event: Event) {
      const detail = (event as CustomEvent<Partial<ProjectListItem> & { id?: string }>).detail;
      if (!detail?.id) return;
      setProjects((current) =>
        current.map((project) =>
          project.id === detail.id
            ? {
                ...project,
                ...detail,
                steps: {
                  ...(project.steps || {}),
                  ...(detail.steps || {})
                }
              }
            : project
        )
      );
    }

    window.addEventListener("lurevid:project-optimistic", applyOptimisticProject);
    return () => window.removeEventListener("lurevid:project-optimistic", applyOptimisticProject);
  }, []);

  useEffect(() => {
    setSwitchingProjectId("");
  }, [pathname]);

  useEffect(() => {
    projects.slice(0, 12).forEach((project) => {
      router.prefetch(`/projects/${project.id}`);
    });
  }, [projects, router]);

  function closeMobileMenu() {
    setMobileOpen(false);
  }

  function startProjectSwitch(projectId: string) {
    if (projectId !== activeProjectId) setSwitchingProjectId(projectId);
    closeMobileMenu();
    router.prefetch(`/projects/${projectId}`);
  }

  return (
    <div className="min-h-screen">
      <div className="sticky inset-x-0 top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between border-b border-[var(--border)] bg-white px-3 pt-[env(safe-area-inset-top)] md:hidden">
        <button className="grid h-10 w-10 place-items-center rounded-xl text-[var(--gray-500)]" onClick={() => setMobileOpen(true)} title="開啟選單">
          <Menu size={19} />
        </button>
        <Image className="h-6 w-auto max-w-[118px]" src="/logo.svg" alt="lurevid" width={118} height={24} priority />
        <Link className="grid h-10 w-10 place-items-center rounded-xl text-orange" href="/" title="新增專案">
          <Plus size={18} />
        </Link>
      </div>
      {mobileOpen && <button className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={closeMobileMenu} aria-label="關閉選單" />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[min(78vw,280px)] flex-col border-r border-[var(--border)] bg-white transition-transform duration-200 md:z-40 md:w-[var(--sidebar-w)] md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-12 items-center justify-between border-b border-[var(--border)] px-4 md:h-[52px]">
          <Image className="h-5 w-auto max-w-[118px]" src="/logo.svg" alt="lurevid" width={118} height={22} priority />
          <button className="grid h-8 w-8 place-items-center rounded-lg text-[var(--gray-500)] md:hidden" onClick={closeMobileMenu} title="關閉選單">
            <X size={16} />
          </button>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col p-2">
          <div className="space-y-0.5">
            <Link
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${pathname === "/" ? "bg-orange-bg text-orange" : "text-[var(--gray-500)] hover:bg-orange-bg hover:text-orange"}`}
              href="/"
              onClick={closeMobileMenu}
              title="新增專案"
            >
              <Plus size={16} />
              <span>新增專案</span>
            </Link>
          </div>

          <div className="mt-3 min-h-0 flex-1 border-t border-[var(--border)] pt-2">
            <div className="mb-1.5 flex items-center justify-between px-2">
              <div className="text-[11px] uppercase tracking-wide text-[var(--gray-500)]">專案</div>
              <span className="text-[11px] text-[var(--gray-300)]">{projects.length}</span>
            </div>
            <div className="max-h-[calc(100dvh-146px)] space-y-0.5 overflow-y-auto pr-1">
              {projects.length === 0 && <div className="rounded-lg bg-[var(--warm-white)] px-3 py-2 text-xs leading-5 text-[var(--gray-500)]">開始分析後，專案會自動存到這裡。</div>}
              {projects.map((project) => {
                const active = activeProjectId === project.id;
                const switching = switchingProjectId === project.id && !active;
                const runningLabel = PROJECT_BUSY_STATUSES.includes(project.status) ? runningProjectLabel(project) : "";

                return (
                  <div className={`rounded-lg px-2 py-0.5 ${active || switching ? "bg-orange-bg" : "hover:bg-[var(--warm-white)]"}`} key={project.id} aria-busy={switching}>
                    <Link
                      className="flex min-w-0 items-center gap-2 py-1"
                      href={`/projects/${project.id}`}
                      onClick={() => startProjectSwitch(project.id)}
                      onMouseEnter={() => router.prefetch(`/projects/${project.id}`)}
                    >
                      <div className={`min-w-0 flex-1 truncate text-xs leading-4 ${active || switching ? "text-orange" : "text-[var(--black)]"}`}>{projectDisplayTitle(project)}</div>
                      {(switching || runningLabel) && (
                        <span className={`inline-flex max-w-[96px] shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] leading-4 ${active || switching ? "bg-white/70 text-orange" : "bg-[var(--warm-white)] text-[var(--gray-500)]"}`}>
                          <Loader2 size={10} className="shrink-0 animate-spin" />
                          <span className="truncate">{switching ? "切換中" : runningLabel}</span>
                        </span>
                      )}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-auto space-y-0.5 border-t border-[var(--border)] pt-2">
            {isAdmin && (
              <>
                <Link
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${pathname === "/health" ? "bg-orange-bg text-orange" : "text-[var(--gray-500)] hover:bg-orange-bg hover:text-orange"}`}
                  href="/health"
                  onClick={closeMobileMenu}
                  title="系統健康檢查"
                >
                  <Activity size={16} />
                  <span>健康檢查</span>
                </Link>
                <Link
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${pathname === "/usage" ? "bg-orange-bg text-orange" : "text-[var(--gray-500)] hover:bg-orange-bg hover:text-orange"}`}
                  href="/usage"
                  onClick={closeMobileMenu}
                  title="用量與預估花費"
                >
                  <BarChart3 size={16} />
                  <span>用量</span>
                </Link>
                <Link
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${pathname === "/settings" ? "bg-orange-bg text-orange" : "text-[var(--gray-500)] hover:bg-orange-bg hover:text-orange"}`}
                  href="/settings"
                  onClick={closeMobileMenu}
                  title="設定"
                >
                  <Settings size={16} />
                  <span>設定</span>
                </Link>
              </>
            )}
            {session?.user && (
              <button
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--gray-500)] hover:bg-orange-bg hover:text-orange"
                onClick={() => signOut({ callbackUrl: "/login" })}
                title="登出"
                type="button"
              >
                <LogOut size={16} />
                <span>登出</span>
              </button>
            )}
          </div>
        </nav>
      </aside>
      <main className="relative md:ml-[var(--sidebar-w)]">
        {switchingProject && (
          <div className="pointer-events-none fixed inset-x-0 top-14 z-[70] flex justify-center md:left-[var(--sidebar-w)] md:top-0">
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--orange-border)] bg-white/95 px-3 py-2 text-xs text-orange shadow-[0_12px_40px_rgb(26_26_26/0.10)] backdrop-blur">
              <Loader2 size={14} className="animate-spin" />
              切換專案中
            </div>
          </div>
        )}
        <div className={switchingProject ? "opacity-75 transition-opacity" : "transition-opacity"}>{children}</div>
      </main>
    </div>
  );
}
