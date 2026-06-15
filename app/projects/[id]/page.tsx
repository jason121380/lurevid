import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/authz";
import { projectWithScenesInclude } from "@/lib/project-access";
import { ProjectClient } from "./ProjectClient";

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?callbackUrl=/projects/${id}`);

  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: projectWithScenesInclude
  });

  if (!project) notFound();

  return (
    <ProjectClient
      projectId={id}
      initialProject={{
        id: project.id,
        title: project.title,
        sourceUrl: project.sourceUrl || undefined,
        sourcePlatform: project.sourcePlatform || undefined,
        sourceVideoUrl: project.sourceVideoUrl || undefined,
        sourceFrameUrls: stringArray(project.sourceFrameUrls),
        sourceTranscript: project.sourceTranscript || undefined,
        visualAnalysis: project.visualAnalysis || undefined,
        analysis: project.analysis || undefined,
        structure: project.structure || undefined,
        adaptedScript: project.adaptedScript || undefined,
        status: project.status,
        message: project.message,
        progress: project.progress,
        steps: (project.steps as Record<string, { status?: string; progress?: number; message?: string }>) || {},
        ratio: project.ratio,
        resolution: project.resolution,
        duration: project.duration,
        finalVideoUrl: project.finalVideoUrl || undefined,
        error: project.error || undefined,
        scenes: project.scenes.map((scene) => ({
          id: scene.id,
          sceneNumber: scene.sceneNumber,
          title: scene.title,
          visualGoal: scene.visualGoal,
          imagePrompt: scene.imagePrompt || undefined,
          imageUrl: scene.imageUrl || undefined,
          seedancePrompt: scene.seedancePrompt,
          status: scene.status,
          videoUrl: scene.videoUrl || undefined,
          error: scene.error || undefined
        }))
      }}
    />
  );
}
