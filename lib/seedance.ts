import { getAppSettings } from "@/lib/settings";

export type SeedanceSettings = {
  ratio: string;
  resolution: string;
  duration: number;
};

export type SeedanceTask = {
  id?: string;
  task_id?: string;
  status?: string;
  content?: {
    video_url?: string;
    file_url?: string;
  };
  video_url?: string;
  url?: string;
  error?: string;
  message?: string;
  [key: string]: unknown;
};

const BYTEPLUS_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
const DEFAULT_SEEDANCE_MODEL = "dreamina-seedance-2-0-260128";

export class SeedanceApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "SeedanceApiError";
  }
}

function seedanceError(data: unknown, fallback: string) {
  if (typeof data === "object" && data !== null) {
    const maybe = data as { error?: unknown; message?: unknown };
    if (typeof maybe.error === "string") return maybe.error;
    if (typeof maybe.message === "string") return maybe.message;
  }
  return fallback;
}

function seedanceModel(value: string | undefined) {
  const model = value?.trim();
  if (!model || model === "dreamina-seedance-2-0-fast-260128") return DEFAULT_SEEDANCE_MODEL;
  return model;
}

export async function createSeedanceTask(
  prompt: string,
  settings: SeedanceSettings,
  imageUrls?: string | string[] | null
): Promise<SeedanceTask> {
  const appSettings = await getAppSettings();
  if (!appSettings.ARK_API_KEY || appSettings.ARK_API_KEY.startsWith("replace-with")) {
    throw new Error("請先在設定頁填入有效的 ARK_API_KEY");
  }
  const images = (Array.isArray(imageUrls) ? imageUrls : imageUrls ? [imageUrls] : []).filter(Boolean);
  const response = await fetch(`${BYTEPLUS_BASE_URL}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appSettings.ARK_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: seedanceModel(appSettings.SEEDANCE_MODEL),
      content: [
        { type: "text", text: prompt },
        ...images.map((url) => ({ type: "image_url", image_url: { url }, role: "reference_image" }))
      ],
      ratio: settings.ratio,
      resolution: settings.resolution,
      duration: settings.duration
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SeedanceApiError(seedanceError(data, `Seedance 建立任務失敗 (${response.status})`), response.status);
  }
  return data as SeedanceTask;
}

export async function getSeedanceTask(taskId: string): Promise<SeedanceTask> {
  const appSettings = await getAppSettings();
  if (!appSettings.ARK_API_KEY) throw new Error("缺少 ARK_API_KEY");
  const response = await fetch(`${BYTEPLUS_BASE_URL}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
    headers: {
      Authorization: `Bearer ${appSettings.ARK_API_KEY}`
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SeedanceApiError(seedanceError(data, `Seedance 查詢任務失敗 (${response.status})`), response.status);
  }
  return data as SeedanceTask;
}

export function extractSeedanceVideoUrl(data: SeedanceTask) {
  return data?.content?.video_url || data?.content?.file_url || data?.video_url || data?.url || "";
}
