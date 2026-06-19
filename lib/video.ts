import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { DEFAULT_MAX_DOWNLOAD_BYTES, safeFetch } from "@/lib/safe-fetch";

export function storageRoot() {
  return resolve(process.env.STORAGE_DIR || "./storage/generated");
}

export async function downloadVideo(url: string, path: string) {
  await mkdir(dirname(path), { recursive: true });
  const response = await safeFetch(url, { maxBytes: DEFAULT_MAX_DOWNLOAD_BYTES });
  if (!response.ok || !response.body) throw new Error("下載影片片段失敗");
  let downloaded = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloaded += chunk.length;
      if (downloaded > DEFAULT_MAX_DOWNLOAD_BYTES) {
        callback(new Error("下載檔案超過大小限制"));
        return;
      }
      callback(null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>), limiter, createWriteStream(path));
}
