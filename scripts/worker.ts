import "dotenv/config";
import { join } from "node:path";
import { Worker } from "bullmq";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mapWithConcurrency } from "@/lib/async";
import { PROJECT_QUEUE_NAME, WORKER_HEARTBEAT_KEY, createRedisConnection, redisConnectionOptions } from "@/lib/queue";
import {
  adaptScript,
  analyzeStructure,
  analyzeVideo,
  generateStoryboardImage,
  generateStoryboardWithTwoModels
} from "@/lib/openai";
import { detectPlatform, fetchTranscript } from "@/lib/transcribe";
import { createSeedanceTask, extractSeedanceVideoUrl, getSeedanceTask } from "@/lib/seedance";
import { analyzeVideoFrames, extractVideoFrames, withDownloadedVideo } from "@/lib/visual";
import { downloadVideo, mergeVideos, storageRoot } from "@/lib/video";
import { uploadFileObject, uploadObject } from "@/lib/storage";
import { transcribeMediaFile } from "@/lib/transcribe";
import { safeFetch } from "@/lib/safe-fetch";
import { markStepDone, markStepFailed, markStepRunning, type StepKey } from "@/lib/steps";

async function fetchToBuffer(url: string) {
  const response = await safeFetch(url, { maxBytes: 25 * 1024 * 1024 });
  if (!response.ok) throw new Error("下載產生的檔案失敗");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error("產生的圖片檔案過大");
  return Buffer.from(bytes);
}

function frameDataUrlToBuffer(dataUrl: string) {
  const [, base64 = ""] = dataUrl.split(",");
  return Buffer.from(base64, "base64");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const IMAGE_CONCURRENCY = Number(process.env.IMAGE_CONCURRENCY || 3);
const SEEDANCE_CONCURRENCY = Number(process.env.SEEDANCE_CONCURRENCY || 3);
const SEEDANCE_POLL_INTERVAL_MS = Number(process.env.SEEDANCE_POLL_INTERVAL_MS || 8000);
const SEEDANCE_POLL_TIMEOUT_MS = Number(process.env.SEEDANCE_POLL_TIMEOUT_MS || 20 * 60 * 1000);
const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) throw new Error("缺少 REDIS_URL");

const analysisIdleStatus = (analysis: string | null) => (analysis ? "ANALYSIS_READY" : "DRAFT");

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function uploadSourceVideo(projectId: string, videoPath: string, current?: string | null) {
  if (current && /^https?:\/\//i.test(current)) return;
  const sourceVideoUrl = await uploadFileObject(`projects/${projectId}/source.mp4`, videoPath, "video/mp4");
  await prisma.project.update({ where: { id: projectId }, data: { sourceVideoUrl, message: "來源影片已下載，可下載 MP4" } });
}

async function extractAndUploadFrames(projectId: string, videoPath: string, dir: string) {
  const frames = await extractVideoFrames(videoPath, dir);
  const sourceFrameUrls = await Promise.all(
    frames.map((frame, index) =>
      uploadObject(`projects/${projectId}/frames/${String(index + 1).padStart(2, "0")}.jpg`, frameDataUrlToBuffer(frame), "image/jpeg")
    )
  );
  await prisma.project.update({ where: { id: projectId }, data: { sourceFrameUrls } });
}

/** 第 4 步「影片分析」= 視覺分析（用已存影格）＋ 整合逐字稿。不需重新下載。 */
async function computeAnalysis(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const platform = project.sourcePlatform || detectPlatform(project.sourceUrl || "");
  const transcript = project.sourceTranscript?.trim() || "";
  if (!transcript) throw new Error("尚未取得逐字稿，請先完成轉錄或手動貼逐字稿");

  let visualAnalysis = project.visualAnalysis || "";
  const frameUrls = Array.isArray(project.sourceFrameUrls) ? (project.sourceFrameUrls as string[]) : [];
  const httpFrames = frameUrls.filter((url) => typeof url === "string" && /^https?:\/\//i.test(url));
  if (httpFrames.length) {
    try {
      visualAnalysis = await analyzeVideoFrames(httpFrames, transcript, platform);
      await prisma.project.update({ where: { id: projectId }, data: { visualAnalysis } });
    } catch {
      /* 視覺分析失敗就退回純文字分析 */
    }
  }
  const analysis = await analyzeVideo(transcript, platform, visualAnalysis || "未取得視覺分析");
  await prisma.project.update({ where: { id: projectId }, data: { analysis } });
}

/** 共用：把單一分析子步驟包成「running → done/failed」，並把整體 status 在跑時設 ANALYZING、結束回到 idle。 */
async function runStepJob(projectId: string, key: StepKey, runningMessage: string, fn: () => Promise<void>) {
  await markStepRunning(projectId, key, 0.15);
  await prisma.project.update({ where: { id: projectId }, data: { status: "ANALYZING", message: runningMessage, error: null } });
  try {
    await fn();
    await markStepDone(projectId, key);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { analysis: true } });
    await prisma.project.update({
      where: { id: projectId },
      data: { status: analysisIdleStatus(project.analysis), message: "已完成該步驟", progress: project.analysis ? 0.2 : 0.12 }
    });
  } catch (error) {
    await markStepFailed(projectId, key, error instanceof Error ? error.message : "未知錯誤");
    throw error;
  }
}

async function runSource(projectId: string) {
  await runStepJob(projectId, "source", "正在下載來源影片", async () => {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    if (!project.sourceUrl) throw new Error("缺少來源影片連結");
    await withDownloadedVideo(project.sourceUrl, async (videoPath) => {
      await uploadSourceVideo(projectId, videoPath, null);
    });
  });
}

async function runTranscribe(projectId: string) {
  await runStepJob(projectId, "transcribe", "正在轉錄音訊", async () => {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    if (!project.sourceUrl) throw new Error("缺少來源影片連結");
    let transcript = "";
    try {
      await withDownloadedVideo(project.sourceUrl, async (videoPath) => {
        transcript = await transcribeMediaFile(videoPath);
      });
    } catch {
      transcript = await fetchTranscript(project.sourceUrl);
    }
    if (!transcript) throw new Error("轉錄結果為空");
    await prisma.project.update({ where: { id: projectId }, data: { sourceTranscript: transcript } });
  });
}

async function runFrames(projectId: string) {
  await runStepJob(projectId, "frames", "正在抽取影片影格", async () => {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    if (!project.sourceUrl) throw new Error("缺少來源影片連結");
    await withDownloadedVideo(project.sourceUrl, async (videoPath, dir) => {
      await uploadSourceVideo(projectId, videoPath, project.sourceVideoUrl);
      await extractAndUploadFrames(projectId, videoPath, dir);
    });
  });
}

async function runAnalyze(projectId: string) {
  await runStepJob(projectId, "analyze", "正在做影片分析（含視覺）", async () => {
    await computeAnalysis(projectId);
  });
}

/** 第一次建立專案：下載一次，依序做 source → transcribe → frames → analyze，逐步更新各步驟狀態。 */
async function runFull(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (!project.sourceUrl) throw new Error("缺少來源影片連結");
  await prisma.project.update({ where: { id: projectId }, data: { status: "ANALYZING", message: "正在下載來源影片", progress: 0.05, error: null } });

  let transcript = project.sourceTranscript?.trim() || "";
  let transcriptError = "";

  try {
    await withDownloadedVideo(project.sourceUrl, async (videoPath, dir) => {
      await markStepRunning(projectId, "source", 0.5);
      await uploadSourceVideo(projectId, videoPath, project.sourceVideoUrl);
      await markStepDone(projectId, "source");

      if (!transcript) {
        try {
          await markStepRunning(projectId, "transcribe", 0.4);
          await prisma.project.update({ where: { id: projectId }, data: { message: "正在轉錄音訊", progress: 0.1 } });
          transcript = await transcribeMediaFile(videoPath);
          await prisma.project.update({ where: { id: projectId }, data: { sourceTranscript: transcript } });
          await markStepDone(projectId, "transcribe");
        } catch (error) {
          transcriptError = error instanceof Error ? error.message : "未知錯誤";
          await markStepFailed(projectId, "transcribe", transcriptError);
        }
      } else {
        await markStepDone(projectId, "transcribe");
      }

      try {
        await markStepRunning(projectId, "frames", 0.4);
        await prisma.project.update({ where: { id: projectId }, data: { message: "正在抽取影片影格", progress: 0.15 } });
        await extractAndUploadFrames(projectId, videoPath, dir);
        await markStepDone(projectId, "frames");
      } catch (error) {
        await markStepFailed(projectId, "frames", error instanceof Error ? error.message : "未知錯誤");
      }
    });
  } catch {
    /* 下載整體失敗，下面再用音訊備援嘗試逐字稿 */
  }

  if (!transcript) {
    try {
      await markStepRunning(projectId, "transcribe", 0.5);
      await prisma.project.update({ where: { id: projectId }, data: { message: "正在改用音訊下載取得逐字稿", progress: 0.12 } });
      transcript = await fetchTranscript(project.sourceUrl);
      await prisma.project.update({ where: { id: projectId }, data: { sourceTranscript: transcript } });
      await markStepDone(projectId, "transcribe");
    } catch (error) {
      const reason = transcriptError || (error instanceof Error ? error.message : "未知錯誤");
      await markStepFailed(projectId, "transcribe", reason);
      throw new Error(`無法下載或轉錄這支影片（${reason}）。請確認影片為公開連結，或在第 2 步手動貼逐字稿。`);
    }
  }

  await markStepRunning(projectId, "analyze", 0.4);
  await prisma.project.update({ where: { id: projectId }, data: { message: "正在整合分析", progress: 0.18 } });
  await computeAnalysis(projectId);
  await markStepDone(projectId, "analyze");
  await prisma.project.update({ where: { id: projectId }, data: { status: "ANALYSIS_READY", message: "分析完成，可調整後繼續", progress: 0.2 } });
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
    data: { status: "STORYBOARDING", message: "正在產生分鏡與 9 張分鏡圖", progress: 0.45, error: null }
  });

  const storyboard = await generateStoryboardWithTwoModels(project.adaptedScript || project.idea);

  // 原子化：先刪舊 scene 再建新 scene，避免 unique 衝突或中間狀態。
  await prisma.$transaction([
    prisma.scene.deleteMany({ where: { projectId } }),
    ...storyboard.map((scene) =>
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
  ]);
  const createdScenes = await prisma.scene.findMany({
    where: { projectId },
    orderBy: { sceneNumber: "asc" }
  });

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
        progress: 0.45 + (imagesDone / createdScenes.length) * 0.05,
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
    data: { status: "GENERATING", message: "正在把分鏡圖送入 Seedance", progress: 0.52, error: null }
  });

  // 冪等：重試時保留已成功的片段，僅對尚未成功的 scene 重新建立 Seedance 任務。
  const scenesToStart = project.scenes.filter((scene) => !(scene.status === "SUCCEEDED" && scene.videoUrl));
  await mapWithConcurrency(scenesToStart, SEEDANCE_CONCURRENCY, async (scene) => {
    if (!scene.imageUrl) throw new Error(`第 ${scene.sceneNumber} 格缺少分鏡圖`);
    await prisma.scene.update({
      where: { id: scene.id },
      data: { status: "QUEUED", seedanceTaskId: null, videoUrl: null, error: null }
    });
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
        raw: jsonValue(task)
      }
    });
  });

  const pollDeadline = Date.now() + SEEDANCE_POLL_TIMEOUT_MS;
  while (true) {
    const current = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { scenes: { orderBy: { sceneNumber: "asc" } } }
    });

    const pending = current.scenes.filter(
      (scene) => scene.status !== "SUCCEEDED" && scene.status !== "FAILED" && scene.seedanceTaskId
    );

    await mapWithConcurrency(pending, SEEDANCE_CONCURRENCY, async (scene) => {
      let task;
      try {
        task = await getSeedanceTask(scene.seedanceTaskId!);
      } catch {
        // 暫時性錯誤（網路/5xx/限流）：視為仍在處理，下一輪再查，不讓單次錯誤拖垮整個 job。
        return;
      }
      const upstreamStatus = String(task.status || "").toLowerCase();
      const videoUrl = extractSeedanceVideoUrl(task);

      if (upstreamStatus === "succeeded" && videoUrl) {
        await prisma.scene.update({
          where: { id: scene.id },
          data: { status: "SUCCEEDED", videoUrl, raw: jsonValue(task) }
        });
      } else if (["failed", "cancelled", "expired"].includes(upstreamStatus)) {
        // 標記該 scene 失敗但不中止輪詢，讓其他 scene 跑完，最後一次性回報。
        await prisma.scene.update({
          where: { id: scene.id },
          data: { status: "FAILED", error: upstreamStatus, raw: jsonValue(task) }
        });
      } else if (JSON.stringify(scene.raw) !== JSON.stringify(task)) {
        await prisma.scene.update({ where: { id: scene.id }, data: { raw: jsonValue(task) } });
      }
    });

    const latest = await prisma.scene.findMany({
      where: { projectId },
      select: { status: true, sceneNumber: true }
    });
    const done = latest.filter((scene) => scene.status === "SUCCEEDED").length;
    const failed = latest.filter((scene) => scene.status === "FAILED");

    await prisma.project.update({
      where: { id: projectId },
      data: {
        progress: 0.52 + (done / latest.length) * 0.38,
        message: `Seedance 生成中：${done}/${latest.length}`
      }
    });

    if (failed.length > 0) {
      const numbers = failed.map((scene) => scene.sceneNumber).sort((a, b) => a - b).join("、");
      throw new Error(`第 ${numbers} 格生成失敗，請重試「生成影片」`);
    }
    if (done === latest.length) break;
    if (Date.now() > pollDeadline) {
      throw new Error("Seedance 生成逾時，請稍後重試「生成影片」");
    }
    await sleep(SEEDANCE_POLL_INTERVAL_MS);
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
  const finalVideoUrl = await uploadFileObject(`projects/${projectId}/final.mp4`, finalPath, "video/mp4");

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
      if (action === "full") await runFull(projectId);
      else if (action === "source") await runSource(projectId);
      else if (action === "transcribe") await runTranscribe(projectId);
      else if (action === "frames") await runFrames(projectId);
      else if (action === "analyze") await runAnalyze(projectId);
      else if (action === "structure") await runStructure(projectId);
      else if (action === "adapt") await runAdapt(projectId);
      else if (action === "storyboard") await generateStoryboard(projectId);
      else await generateVideo(projectId);
    } catch (error) {
      const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
      if (!exists) {
        console.warn(`skip stale job ${job.id}: project ${projectId} no longer exists`);
        return;
      }
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
    connection: { url: REDIS_URL, ...redisConnectionOptions() },
    concurrency: Number(process.env.WORKER_CONCURRENCY || 1)
  }
);

worker.on("completed", (job) => console.log(`completed ${job.id}`));
worker.on("failed", (job, error) => console.error(`failed ${job?.id}`, error));

// 心跳：定期寫入 Redis，讓 /health 能判斷 worker 是否還活著。
const heartbeatRedis = createRedisConnection();
async function sendHeartbeat() {
  try {
    await heartbeatRedis.set(WORKER_HEARTBEAT_KEY, Date.now().toString(), "EX", 60);
  } catch (error) {
    console.error("heartbeat failed", error);
  }
}
sendHeartbeat();
setInterval(sendHeartbeat, 15000);

console.log("Seedance worker started");
