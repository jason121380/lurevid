import { Queue } from "bullmq";
import IORedis from "ioredis";

export const PROJECT_QUEUE_NAME = "seedance-projects";

export function createRedisConnection() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("缺少 REDIS_URL");
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null
  }) as any;
}

export function createProjectQueue() {
  return new Queue(PROJECT_QUEUE_NAME, {
    connection: createRedisConnection()
  });
}
