import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

export const PROJECT_QUEUE_NAME = "seedance-projects";
export const WORKER_HEARTBEAT_KEY = "lurevid:worker:heartbeat";

export type ProjectAction =
  | "full"
  | "source"
  | "transcribe"
  | "frames"
  | "analyze"
  | "structure"
  | "adapt"
  | "storyboard"
  | "mergeStoryboard"
  | "video";

export type ProjectJobData = {
  uploadedVideoPath?: string;
};

export function redisConnectionOptions() {
  return {
    connectTimeout: 5000,
    enableOfflineQueue: true,
    keepAlive: 10000,
    retryStrategy: (times: number) => Math.min(times * 1000, 10000),
    maxRetriesPerRequest: null
  };
}

export function createRedisConnection(): IORedis {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("缺少 REDIS_URL");
  return new IORedis(redisUrl, redisConnectionOptions());
}

export function createProjectQueue() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("缺少 REDIS_URL");
  return new Queue(PROJECT_QUEUE_NAME, {
    connection: { url: redisUrl, ...redisConnectionOptions() }
  });
}

export async function enqueueProjectJob(projectId: string, action: ProjectAction, opts?: JobsOptions, data?: ProjectJobData) {
  const queue = createProjectQueue();
  try {
    await queue.add(
      `${action}-${projectId}`,
      { projectId, action, ...(data ?? {}) },
      { removeOnComplete: true, removeOnFail: 50, attempts: 1, ...(opts ?? {}) }
    );
  } finally {
    await queue.close();
  }
}
