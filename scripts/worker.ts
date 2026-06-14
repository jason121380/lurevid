import "dotenv/config";
import { join } from "node:path";
import { Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import { PROJECT_QUEUE_NAME, createRedisConnection } from "@/lib/queue";
import { generateStoryboardImage, generateStoryboardWithTwoModels } from "@/lib/openai";
import { createSeedanceTask, extractSeedanceVideoUrl, getSeedanceTask } from "@/lib/seedance";
import {
  downloadImage,
  downloadVideo,
  mergeVideos,
  publicImageUrl,
  publicVideoUrl,
  storageRoot,
  writeBase64Image
} from "@/lib/video";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateStoryboard(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`找不到專案：${projectId}`);

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "STORYBOARDING", message: "正在產生分鏡與 9 張分鏡圖", progress: 0.05 }
  });

  const storyboard = await generateStoryboardWithTwoModels(project.idea);
  await prisma.scene.deleteMany({ where: { projectId } });

  const createdScenes = [];
  for (const scene of storyboard) {
    const created = await prisma.scene.create({
      data: {
        projectId,
        sceneNumber: scene.sceneNumber,
        title: scene.title,
        visualGoal: scene.visualGoal,
        imagePrompt: scene.imagePrompt,
        seedancePrompt: scene.seedancePrompt,
        status: "IMAGE_GENERATING"
      }
    });
    createdScenes.push(created);
  }

  for (const scene of createdScenes) {
    const image = await generateStoryboardImage(scene.imagePrompt || scene.seedancePrompt, project.ratio);
    const imagePath = join(storageRoot(), projectId, `${String(scene.sceneNumber).padStart(2, "0")}.png`);

    if (image.b64_json) await writeBase64Image(image.b64_json, imagePath);
    else if (image.url) await downloadImage(image.url, imagePath);
    else throw new Error(`第 ${scene.sceneNumber} 格沒有分鏡圖`);

    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        imageLocalPath: imagePath,
        imageUrl: publicImageUrl(projectId, scene.id),
        status: "IMAGE_READY"
      }
    });

    await prisma.project.update({
      where: { id: projectId },
      data: {
        progress: 0.08 + (scene.sceneNumber / createdScenes.length) * 0.42,
        message: `正在產生分鏡圖：${scene.sceneNumber}/${createdScenes.length}`
      }
    });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "STORYBOARD_READY", message: "分鏡圖完成，可以變成影片", progress: 0.5 }
  });
}

async function generateVideo(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { scenes: { orderBy: { sceneNumber: "asc" } } }
  });
  if (!project) throw new Error(`找不到專案：${projectId}`);
  if (project.scenes.length !== 9) throw new Error("需要 9 張分鏡圖才能生成影片");

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "GENERATING", message: "正在把分鏡圖送入 Seedance", progress: 0.52 }
  });

  for (const scene of project.scenes) {
    if (!scene.imageUrl) throw new Error(`第 ${scene.sceneNumber} 格缺少分鏡圖`);
    await prisma.scene.update({ where: { id: scene.id }, data: { status: "QUEUED" } });
    const task = await createSeedanceTask(
      scene.seedancePrompt,
      {
        ratio: project.ratio,
        resolution: project.resolution,
        duration: project.duration
      },
      scene.imageUrl
    );
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
      data: { progress: 0.52 + (done / current.scenes.length) * 0.38, message: `Seedance 生成中：${done}/${current.scenes.length}` }
    });

    if (done === current.scenes.length) break;
    await sleep(8000);
  }

  await prisma.project.update({ where: { id: projectId }, data: { status: "MERGING", message: "正在合成影片", progress: 0.92 } });
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
    const action = String(job.data.action || "video");
    try {
      if (action === "storyboard") await generateStoryboard(projectId);
      else await generateVideo(projectId);
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
