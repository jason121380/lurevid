"use client";

import { ArrowLeft, CheckCircle2, Download, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";

type Scene = {
  id: string;
  sceneNumber: number;
  title: string;
  visualGoal: string;
  seedancePrompt: string;
  status: string;
  videoUrl?: string;
  error?: string;
};

type Project = {
  id: string;
  idea: string;
  status: string;
  message: string;
  progress: number;
  finalVideoUrl?: string;
  scenes: Scene[];
};

function statusClass(status: string) {
  if (status === "COMPLETED" || status === "SUCCEEDED") return "badge-active";
  if (status === "FAILED") return "badge-error";
  return "badge-warn";
}

export function ProjectClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stopped = false;
    async function load() {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      if (stopped) return;
      if (!res.ok) {
        setError(data.error || "讀取失敗");
        return;
      }
      setProject(data);
      if (!["COMPLETED", "FAILED"].includes(data.status)) setTimeout(load, 5000);
    }
    load();
    return () => {
      stopped = true;
    };
  }, [projectId]);

  if (error) return <Shell><div className="p-6 text-[var(--red)]">{error}</div></Shell>;
  if (!project) return <Shell><div className="grid min-h-screen place-items-center"><Loader2 className="animate-spin text-orange" /></div></Shell>;

  return (
    <Shell>
      <div className="min-h-screen bg-[var(--warm-white)]">
        <div className="flex h-[60px] items-center justify-between border-b border-[var(--border)] bg-white px-6">
          <Link className="btn btn-ghost" href="/">
            <ArrowLeft size={16} />
            返回工作台
          </Link>
          <span className={`badge ${statusClass(project.status)}`}>{project.status}</span>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:p-6">
          <section className="space-y-4">
            <div className="card p-4">
              <p className="text-[11px] font-bold uppercase text-orange">Project</p>
              <h1 className="mt-1 text-xl font-extrabold">{project.idea}</h1>
              <p className="mt-2 text-sm text-[var(--gray-500)]">{project.message}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--border)]">
                <div className="h-full rounded-full bg-orange transition-all" style={{ width: `${Math.round(project.progress * 100)}%` }} />
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-3">
              {project.scenes.map((scene) => (
                <article key={scene.id} className="card p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-black text-orange">{String(scene.sceneNumber).padStart(2, "0")}</span>
                    <span className={`badge ${statusClass(scene.status)}`}>{scene.status}</span>
                  </div>
                  <h2 className="text-sm font-extrabold">{scene.title}</h2>
                  <p className="mt-2 text-xs leading-5 text-[var(--gray-500)]">{scene.visualGoal}</p>
                  <p className="mt-3 max-h-28 overflow-auto rounded-lg bg-[var(--warm-white)] p-2 text-[11px] leading-5">{scene.seedancePrompt}</p>
                </article>
              ))}
            </div>
          </section>

          <aside className="card h-fit p-4 lg:sticky lg:top-6">
            <div className="mb-3 flex items-center gap-2">
              {project.status === "COMPLETED" ? <CheckCircle2 className="text-[var(--green)]" /> : project.status === "FAILED" ? <XCircle className="text-[var(--red)]" /> : <Loader2 className="animate-spin text-orange" />}
              <h2 className="text-lg font-extrabold">輸出影片</h2>
            </div>
            <div className="grid aspect-video place-items-center overflow-hidden rounded-xl bg-[#111] text-sm font-bold text-white">
              {project.finalVideoUrl ? <video src={project.finalVideoUrl} controls playsInline className="h-full w-full object-contain" /> : "影片生成中"}
            </div>
            {project.finalVideoUrl && (
              <a className="btn btn-primary mt-4 w-full" href={project.finalVideoUrl} target="_blank" rel="noreferrer">
                <Download size={16} />
                下載完成影片
              </a>
            )}
          </aside>
        </div>
      </div>
    </Shell>
  );
}
