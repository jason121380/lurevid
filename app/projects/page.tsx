"use client";

import { Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TopAppBar } from "@/components/ui/TopAppBar";
import { ListGroup, ListRow } from "@/components/ui/ListRow";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/Toast";
import {
  PROJECT_BUSY_STATUSES,
  projectDisplayTitle,
  runningProjectLabel,
  type ProjectListItem
} from "@/lib/project-display";

function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(iso).toLocaleDateString("zh-TW");
}

export default function ProjectsPage() {
  const router = useRouter();
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (res.ok) setProjects(data.projects || []);
      else toast(data.error || "讀取專案列表失敗", "error");
    } catch {
      toast("讀取專案列表失敗", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadProjects();
    window.addEventListener("lurevid:projects-changed", loadProjects);
    return () => window.removeEventListener("lurevid:projects-changed", loadProjects);
  }, [loadProjects]);

  // 工作區會派發樂觀更新事件；即時反映各專案進度。
  useEffect(() => {
    function applyOptimistic(event: Event) {
      const detail = (event as CustomEvent<Partial<ProjectListItem> & { id?: string }>).detail;
      if (!detail?.id) return;
      setProjects((current) =>
        current.map((project) =>
          project.id === detail.id
            ? { ...project, ...detail, steps: { ...(project.steps || {}), ...(detail.steps || {}) } }
            : project
        )
      );
    }
    window.addEventListener("lurevid:project-optimistic", applyOptimistic);
    return () => window.removeEventListener("lurevid:project-optimistic", applyOptimistic);
  }, []);

  useEffect(() => {
    projects.slice(0, 12).forEach((project) => router.prefetch(`/projects/${project.id}`));
  }, [projects, router]);

  return (
    <div className="min-h-dvh bg-[var(--warm-white)]">
      <TopAppBar
        title="專案"
        align="left"
        right={
          <Link className="grid h-9 w-9 place-items-center rounded-full bg-orange text-white shadow-[0_6px_16px_rgb(255_107_44/0.22)]" href="/" title="新增專案">
            <Plus size={18} />
          </Link>
        }
      />

      <div className="mx-auto max-w-content px-4 py-4">
        {loading && projects.length === 0 ? (
          <div className="surface divide-y divide-[var(--border)] overflow-hidden">
            {Array.from({ length: 4 }, (_, i) => (
              <div className="flex items-center gap-3 px-4 py-4" key={i}>
                <div className="h-4 flex-1 rounded-full bg-[var(--surface-muted)]" />
                <div className="h-4 w-14 rounded-full bg-[var(--surface-muted)]" />
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={<Sparkles size={22} />}
            title="還沒有專案"
            description="開始分析後，專案會自動存到這裡。"
            action={
              <Link className="btn btn-primary" href="/">
                <Plus size={16} />
                新增專案
              </Link>
            }
          />
        ) : (
          <ListGroup>
            {projects.map((project) => {
              const busy = PROJECT_BUSY_STATUSES.includes(project.status);
              const runningLabel = busy ? runningProjectLabel(project) : "";
              return (
                <ListRow
                  key={project.id}
                  href={`/projects/${project.id}`}
                  onMouseEnter={() => router.prefetch(`/projects/${project.id}`)}
                  title={projectDisplayTitle(project)}
                  subtitle={`${project.sourcePlatform || "影片"} · ${relativeTime(project.updatedAt)}`}
                  trailing={
                    runningLabel ? (
                      <StatusPill tone="warn" spinning>
                        {runningLabel}
                      </StatusPill>
                    ) : project.status === "COMPLETED" ? (
                      <StatusPill tone="ok">已完成</StatusPill>
                    ) : null
                  }
                />
              );
            })}
          </ListGroup>
        )}
      </div>
    </div>
  );
}
