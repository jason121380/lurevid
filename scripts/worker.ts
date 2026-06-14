import "dotenv/config";
import { join } from "node:path";
import { Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import { PROJECT_QUEUE_NAME, createRedisConnection } from "@/lib/queue";
import { createSeedanceTask, extractSeedanceVideoUrl, getSeedanceTask } from "@/lib/seedance";
import { downloadVideo, mergeVideos, publicVideoUrl, storageRoot } from "@/lib/video";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function processProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { scenes: { orderBy: { sceneNumber: "asc" } } }
  });
  if (!project) throw new Error(`找不到專案：${projectId}`);

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "GENERATING", message: "正在送出 9 個 Seedance 任務", progress: 0.05 }
  });

  for (const scene of project.scenes) {
    await prisma.scene.update({ where: { id: scene.id }, data: { status: "QUEUED" } });
    const task = await createSeedanceTask(scene.seedancePrompt, {
      ratio: project.ratio,
      resolution: project.resolution,
      duration: project.duration
    });
    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        status: "GENERATING",
        seedanceTaskId: task.id || task.task_id,
        raw: task
      }
    });
  }

  while (true) {
    const current = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { scenes: { orderBy: { sceneNumber: "asc" } } }
    });

    let done = 0;
    for (const scene of current.scenes) {
      if (scene.status === "SUCCEEDED") {
        done += 1;
        continue;
      }
      if (!scene.seedanceTaskId) continue;

      const task = await getSeedanceTask(scene.seedanceTaskId);
      const upstreamStatus = String(task.status || "").toLowerCase();
      const videoUrl = extractSeedanceVideoUrl(task);

      if (upstreamStatus === "succeeded" && videoUrl) {
        done += 1;
        await prisma.scene.update({
          where: { id: scene.id },
          data: { status: "SUCCEEDED", videoUrl, raw: task }
        });
      } else if (["failed", "cancelled", "expired"].includes(upstreamStatus)) {
        await prisma.scene.update({
          where: { id: scene.id },
          data: { status: "FAILED", error: upstreamStatus, raw: task }
        });
        throw new Error(`第 ${scene.sceneNumber} 格生成失敗：${upstreamStatus}`);
      } else {
        await prisma.scene.update({ where: { id: scene.id }, data: { raw: task } });
      }
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { progress: 0.1 + (done / current.scenes.length) * 0.75, message: `Seedance 生成中：${done}/${current.scenes.length}` }
    });

    if (done === current.scenes.length) break;
    await sleep(8000);
  }

  await prisma.project.update({ where: { id: projectId }, data: { status: "MERGING", message: "正在下載片段並合成影片", progress: 0.9 } });
  const finished = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { scenes: { orderBy: { sceneNumber: "asc" } } }
  });

  const clipPaths: string[] = [];
  for (const scene of finished.scenes) {
    if (!scene.videoUrl) throw new Error(`第 ${scene.sceneNumber} 格沒有 videoUrl`);
    const path = join(storageRoot(), projectId, `${String(scene.sceneNumber).padStart(2, "0")}.mp4`);
    await downloadVideo(scene.videoUrl, path);
    clipPaths.push(path);
    await prisma.scene.update({ where: { id: scene.id }, data: { localPath: path } });
  }

  await mergeVideos(projectId, clipPaths);
  await prisma.project.update({
    where: { id: projectId },
    data: { status: "COMPLETED", message: "影片完成", progress: 1, finalVideoUrl: publicVideoUrl(projectId) }
  });
}

const worker = new Worker(
  PROJECT_QUEUE_NAME,
  async (job) => {
    const projectId = String(job.data.projectId);
    try {
      await processProject(projectId);
    } catch (error) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: "FAILED",
          message: "任務失敗",
          error: error instanceof Error ? error.message : "未知錯誤"
        }
      });
      throw error;
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: Number(process.env.WORKER_CONCURRENCY || 1)
  }
);

worker.on("completed", (job) => console.log(`completed ${job.id}`));
worker.on("failed", (job, error) => console.error(`failed ${job?.id}`, error));

console.log("Seedance worker started");
