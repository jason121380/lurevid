import { NextResponse } from "next/server";
import IORedis from "ioredis";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/authz";
import { getAppSettings } from "@/lib/settings";
import { PROJECT_QUEUE_NAME, WORKER_HEARTBEAT_KEY } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "warn" | "error";
type Check = { key: string; label: string; status: CheckStatus; detail: string };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("逾時")), ms))
  ]);
}

function isMissing(value: string | undefined) {
  return !value || value === "sk-..." || value.startsWith("your-") || value.startsWith("replace-with") || value.startsWith("https://<");
}

async function checkDatabase(): Promise<Check> {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 4000);
    return { key: "database", label: "PostgreSQL 資料庫", status: "ok", detail: "連線正常" };
  } catch (error) {
    return { key: "database", label: "PostgreSQL 資料庫", status: "error", detail: error instanceof Error ? error.message.slice(0, 120) : "連線失敗" };
  }
}

async function checkRedisAndWorker(): Promise<{ redis: Check; worker: Check }> {
  const url = process.env.REDIS_URL;
  if (!url) {
    return {
      redis: { key: "redis", label: "Redis", status: "error", detail: "缺少 REDIS_URL" },
      worker: { key: "worker", label: "Worker 背景服務", status: "error", detail: "無法確認（Redis 未設定）" }
    };
  }

  const redis = new IORedis(url, { connectTimeout: 3000, maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true });
  try {
    await withTimeout(redis.connect(), 3000);
    await withTimeout(redis.ping(), 3000);
    const beat = await withTimeout(redis.get(WORKER_HEARTBEAT_KEY), 3000);

    const redisCheck: Check = { key: "redis", label: "Redis", status: "ok", detail: "連線正常" };

    let worker: Check;
    if (!beat) {
      worker = { key: "worker", label: "Worker 背景服務", status: "error", detail: "偵測不到 worker 心跳，請確認有跑 npm run worker 的服務" };
    } else {
      const ageSec = Math.round((Date.now() - Number(beat)) / 1000);
      worker = ageSec <= 60
        ? { key: "worker", label: "Worker 背景服務", status: "ok", detail: `運作中（最後心跳 ${Math.max(0, ageSec)} 秒前）` }
        : { key: "worker", label: "Worker 背景服務", status: "error", detail: `心跳過舊（${ageSec} 秒前），worker 可能已停止` };
    }
    return { redis: redisCheck, worker };
  } catch (error) {
    return {
      redis: { key: "redis", label: "Redis", status: "error", detail: error instanceof Error ? error.message.slice(0, 120) : "連線失敗" },
      worker: { key: "worker", label: "Worker 背景服務", status: "error", detail: "無法確認（Redis 連線失敗）" }
    };
  } finally {
    redis.disconnect();
  }
}

async function checkQueue(): Promise<Check> {
  const url = process.env.REDIS_URL;
  if (!url) return { key: "queue", label: "工作佇列", status: "error", detail: "缺少 REDIS_URL" };
  const redis = new IORedis(url, { connectTimeout: 3000, maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true });
  try {
    await withTimeout(redis.connect(), 3000);
    const prefix = `bull:${PROJECT_QUEUE_NAME}`;
    const [waiting, active, failed] = await withTimeout(
      Promise.all([redis.llen(`${prefix}:wait`), redis.llen(`${prefix}:active`), redis.zcard(`${prefix}:failed`)]),
      3000
    );
    const status: CheckStatus = failed > 0 ? "warn" : "ok";
    return { key: "queue", label: "工作佇列", status, detail: `等待 ${waiting} · 進行中 ${active} · 失敗 ${failed}` };
  } catch (error) {
    return { key: "queue", label: "工作佇列", status: "error", detail: error instanceof Error ? error.message.slice(0, 120) : "查詢失敗" };
  } finally {
    redis.disconnect();
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const settings = await getAppSettings().catch(() => null);

  const [database, redisWorker, queue] = await Promise.all([checkDatabase(), checkRedisAndWorker(), checkQueue()]);

  const configChecks: Check[] = [];
  if (settings) {
    configChecks.push({
      key: "openai",
      label: "OpenAI 金鑰",
      status: isMissing(settings.OPENAI_API_KEY) ? "error" : "ok",
      detail: isMissing(settings.OPENAI_API_KEY) ? "尚未設定（分析/分鏡無法運作）" : "已設定"
    });
    configChecks.push({
      key: "seedance",
      label: "Seedance 金鑰",
      status: isMissing(settings.ARK_API_KEY) ? "warn" : "ok",
      detail: isMissing(settings.ARK_API_KEY) ? "尚未設定（無法生成影片片段）" : "已設定"
    });
    const s3Ready = !isMissing(settings.S3_ACCESS_KEY_ID) && !isMissing(settings.S3_SECRET_ACCESS_KEY) && Boolean(settings.S3_BUCKET) && Boolean(settings.S3_PUBLIC_URL);
    configChecks.push({
      key: "s3",
      label: "S3 / R2 物件儲存",
      status: s3Ready ? "ok" : "warn",
      detail: s3Ready ? "已設定" : "尚未完成（分鏡圖與成品影片需要）"
    });
  } else {
    configChecks.push({ key: "settings", label: "應用設定", status: "error", detail: "無法讀取設定（資料庫問題？）" });
  }

  const checks: Check[] = [database, redisWorker.redis, redisWorker.worker, queue, ...configChecks];
  return NextResponse.json({ checks, checkedAt: new Date().toISOString() });
}
