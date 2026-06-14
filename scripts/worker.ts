import "dotenv/config";
import { join } from "node:path";
import { Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import { mapWithConcurrency } from "@/lib/async";
import { PROJECT_QUEUE_NAME, createRedisConnection } from "@/lib/queue";
import { readFile } from "node:fs/promises";
import {
  adaptScript,
  analyzeStructure,
  analyzeVideo,
  generateStoryboardImage,
  generateStoryboardWithTwoModels
} from "@/lib/openai";
import { detectPlatform, fetchTranscript } from "@/lib/transcribe";
import { createSeedanceTask, extractSeedanceVideoUrl, getSeedanceTask } from "@/lib/seedance";
import { downloadVideo, mergeVideos, storageRoot } from "@/lib/video";
import { uploadObject } from "@/lib/storage";

async function fetchToBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下載檔案失敗：${url}`);
  return Buffer.from(await response.arrayBuffer());
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const IMAGE_CONCURRENCY = Number(process.env.IMAGE_CONCURRENCY || 3);
const SEEDANCE_CONCURRENCY = Number(process.env.SEEDANCE_CONCURRENCY || 3);

async function runAnalyze(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`找不到專案：${projectId}`);
  if (!project.sourceUrl) throw new Error("缺少來源影片連結");

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "ANALYZING", message: "正在取得影片內容並分析", progress: 0.1, error: null }
  });

  let transcript = project.sourceTranscript?.trim() || "";
  if (!transcript) {
    try {
      transcript = await fetchTranscript(project.sourceUrl);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "未知錯誤";
      throw new Error(`無法自動抓取影片逐字稿（${reason}）。請改用手動貼上逐字稿後重試。`);
    }
    await prisma.project.update({ where: { id: projectId }, data: { sourceTranscript: transcript } });
  }

  const platform = project.sourcePlatform || detectPlatform(project.sourceUrl);
  const analysis = await analyzeVideo(transcript, platform);

  await prisma.project.update({
    where: { id: projectId },
    data: { analysis, status: "ANALYSIS_READY", message: "分析完成，可調整後繼續", progress: 0.2 }
  });
}

async function runStructure(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`找不到專案：${projectId}`);
  if (!project.analysis) throw new Error("尚未完成分析");

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "STRUCTURING", message: "正在拆解影片結構", progress: 0.25 }
  });

  const structure = await analyzeStructure(project.sourceTranscript || "", project.analysis);

  await prisma.project.update({
    where: { id: projectId },
    data: { structure, status: "STRUCTURE_READY", message: "結構拆解完成，可調整後繼續", progress: 0.32 }
  });
}

async function runAdapt(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`找不到專案：${projectId}`);
  if (!project.analysis || !project.structure) throw new Error("尚未完成結構拆解");

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "ADAPTING", message: "正在改編成新腳本", progress: 0.36 }
  });

  const adaptedScript = await adaptScript(project.analysis, project.structure);

  await prisma.project.update({
    where: { id: projectId },
    data: {
      adaptedScript,
      idea: adaptedScript,
      status: "ADAPT_READY",
      message: "改編完成，可調整後產生分鏡圖",
      progress: 0.4
    }
  });
}

async function generateStoryboard(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`找不到專案：${projectId}`);

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "STORYBOARDING", message: "正在產生分鏡與 9 張分鏡圖", progress: 0.45 }
  });

  const storyboard = await generateStoryboardWithTwoModels(project.adaptedScript || project.idea);
  await prisma.scene.deleteMany({ where: { projectId } });

  const createdScenes = await Promise.all(
    storyboard.map((scene) =>
      prisma.scene.create({
        data: {
          projectId,
          sceneNumber: scene.sceneNumber,
          title: scene.title,
          visualGoal: scene.visualGoal,
          imagePrompt: scene.imagePrompt,
          seedancePrompt: scene.seedancePrompt,
          status: "IMAGE_GENERATING"
        }
      })
    )
  );

  let imagesDone = 0;
  await mapWithConcurrency(createdScenes, IMAGE_CONCURRENCY, async (scene) => {
    const image = await generateStoryboardImage(scene.imagePrompt || scene.seedancePrompt, project.ratio);

    let buffer: Buffer;
    if (image.b64_json) buffer = Buffer.from(image.b64_json, "base64");
    else if (image.url) buffer = await fetchToBuffer(image.url);
    else throw new Error(`第 ${scene.sceneNumber} 格沒有分鏡圖`);

    const imageUrl = await uploadObject(
      `projects/${projectId}/${String(scene.sceneNumber).padStart(2, "0")}.png`,
      buffer,
      "image/png"
    );

    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        imageUrl,
        status: "IMAGE_READY"
      }
    });

    imagesDone += 1;
    await prisma.project.update({
      where: { id: projectId },
      data: {
        progress: 0.08 + (imagesDone / createdScenes.length) * 0.42,
        message: `正在產生分鏡圖：${imagesDone}/${createdScenes.length}`
      }
    });
  });

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

  await mapWithConcurrency(project.scenes, SEEDANCE_CONCURRENCY, async (scene) => {
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
  });

  while (true) {
    const current = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { scenes: { orderBy: { sceneNumber: "asc" } } }
    });

    let done = current.scenes.filter((scene) => scene.status === "SUCCEEDED").length;
    const pending = current.scenes.filter(
      (scene) => scene.status !== "SUCCEEDED" && scene.seedanceTaskId
    );

    await mapWithConcurrency(pending, SEEDANCE_CONCURRENCY, async (scene) => {
      const task = await getSeedanceTask(scene.seedanceTaskId!);
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
    });

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

  const clipPaths = await mapWithConcurrency(finished.scenes, SEEDANCE_CONCURRENCY, async (scene) => {
    if (!scene.videoUrl) throw new Error(`第 ${scene.sceneNumber} 格沒有 videoUrl`);
    const path = join(storageRoot(), projectId, `${String(scene.sceneNumber).padStart(2, "0")}.mp4`);
    await downloadVideo(scene.videoUrl, path);
    await prisma.scene.update({ where: { id: scene.id }, data: { localPath: path } });
    return path;
  });

  const finalPath = await mergeVideos(projectId, clipPaths);
  const finalVideoUrl = await uploadObject(
    `projects/${projectId}/final.mp4`,
    await readFile(finalPath),
    "video/mp4"
  );

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "COMPLETED", message: "影片完成", progress: 1, finalVideoUrl }
  });
}

const worker = new Worker(
  PROJECT_QUEUE_NAME,
  async (job) => {
    const projectId = String(job.data.projectId);
    const action = String(job.data.action || "video");
    try {
      if (action === "analyze") await runAnalyze(projectId);
      else if (action === "structure") await runStructure(projectId);
      else if (action === "adapt") await runAdapt(projectId);
      else if (action === "storyboard") await generateStoryboard(projectId);
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
