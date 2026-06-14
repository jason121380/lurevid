import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

export const PROJECT_QUEUE_NAME = "seedance-projects";

export type ProjectAction = "analyze" | "structure" | "adapt" | "storyboard" | "video";

export function createRedisConnection() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("缺少 REDIS_URL");
  return new IORedis(redisUrl, {
    connectTimeout: 1000,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    maxRetriesPerRequest: null
  }) as any;
}

export function createProjectQueue() {
  return new Queue(PROJECT_QUEUE_NAME, {
    connection: createRedisConnection()
  });
}

export async function enqueueProjectJob(projectId: string, action: ProjectAction, opts?: JobsOptions) {
  const queue = createProjectQueue();
  try {
    await queue.add(`${action}-${projectId}`, { projectId, action }, opts ?? { attempts: 1 });
  } finally {
    await queue.close();
  }
}
