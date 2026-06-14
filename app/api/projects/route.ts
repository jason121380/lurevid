import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createProjectQueue } from "@/lib/queue";

export const runtime = "nodejs";

const createProjectSchema = z.object({
  idea: z.string().min(1),
  settings: z.object({
    ratio: z.string().default("16:9"),
    resolution: z.string().default("720p"),
    duration: z.number().int().min(2).max(15).default(5)
  }),
  scenes: z
    .array(
      z.object({
        sceneNumber: z.number().int().min(1).max(9),
        title: z.string().min(1),
        visualGoal: z.string().min(1),
        seedancePrompt: z.string().min(20)
      })
    )
    .length(9)
});

export async function POST(request: Request) {
  try {
    const body = createProjectSchema.parse(await request.json());
    const project = await prisma.project.create({
      data: {
        idea: body.idea,
        ratio: body.settings.ratio,
        resolution: body.settings.resolution,
        duration: body.settings.duration,
        status: "QUEUED",
        message: "已排入生成佇列",
        scenes: {
          create: body.scenes.map((scene) => ({
            sceneNumber: scene.sceneNumber,
            title: scene.title,
            visualGoal: scene.visualGoal,
            seedancePrompt: scene.seedancePrompt,
            status: "PROMPT_READY"
          }))
        }
      },
      include: { scenes: { orderBy: { sceneNumber: "asc" } } }
    });

    const queue = createProjectQueue();
    await queue.add("generate-project", { projectId: project.id }, { attempts: 2, backoff: { type: "exponential", delay: 5000 } });
    await queue.close();

    return NextResponse.json(project, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "建立專案失敗" }, { status: 500 });
  }
}

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { scenes: { orderBy: { sceneNumber: "asc" } } }
  });
  return NextResponse.json({ projects });
}
