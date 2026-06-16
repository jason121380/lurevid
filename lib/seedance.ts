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

const DEFAULT_BYTEPLUS_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
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

export function isSeedancePrivacyImageError(error: unknown) {
  if (!(error instanceof SeedanceApiError)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("inputimagesensitivecontentdetected") ||
    message.includes("privacyinformation") ||
    message.includes("input image may contain real person") ||
    message.includes("real person")
  );
}

async function parseSeedanceResponse(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw.trim()) return { data: {}, raw: "" };
  try {
    return { data: JSON.parse(raw) as unknown, raw };
  } catch {
    return { data: {}, raw };
  }
}

function seedanceError(data: unknown, fallback: string, raw = "") {
  if (typeof data === "object" && data !== null) {
    const maybe = data as { error?: unknown; message?: unknown; code?: unknown };
    if (typeof maybe.error === "string") return maybe.error;
    if (typeof maybe.message === "string") return maybe.message;
    if (typeof maybe.error === "object" && maybe.error !== null) {
      const nested = maybe.error as { code?: unknown; message?: unknown };
      const code = typeof nested.code === "string" ? nested.code : "";
      const message = typeof nested.message === "string" ? nested.message : "";
      if (code || message) return [code, message].filter(Boolean).join("：");
    }
    if (typeof maybe.code === "string") return maybe.code;
    try {
      return `${fallback}：${JSON.stringify(data).slice(0, 500)}`;
    } catch {
      return fallback;
    }
  }
  if (raw.trim()) return `${fallback}：${raw.trim().slice(0, 500)}`;
  return fallback;
}

function seedanceModel(value: string | undefined) {
  const model = value?.trim();
  if (!model || model === "dreamina-seedance-2-0-fast-260128") return DEFAULT_SEEDANCE_MODEL;
  return model;
}

function arkBaseUrl(value: string | undefined) {
  return (value?.trim() || DEFAULT_BYTEPLUS_BASE_URL).replace(/\/+$/, "");
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
  const response = await fetch(`${arkBaseUrl(appSettings.ARK_BASE_URL)}/contents/generations/tasks`, {
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

  const { data, raw } = await parseSeedanceResponse(response);
  if (!response.ok) {
    throw new SeedanceApiError(seedanceError(data, `Seedance 建立任務失敗 (${response.status})`, raw), response.status);
  }
  return data as SeedanceTask;
}

export async function getSeedanceTask(taskId: string): Promise<SeedanceTask> {
  const appSettings = await getAppSettings();
  if (!appSettings.ARK_API_KEY) throw new Error("缺少 ARK_API_KEY");
  const response = await fetch(`${arkBaseUrl(appSettings.ARK_BASE_URL)}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
    headers: {
      Authorization: `Bearer ${appSettings.ARK_API_KEY}`
    }
  });

  const { data, raw } = await parseSeedanceResponse(response);
  if (!response.ok) {
    throw new SeedanceApiError(seedanceError(data, `Seedance 查詢任務失敗 (${response.status})`, raw), response.status);
  }
  return data as SeedanceTask;
}

export function extractSeedanceVideoUrl(data: SeedanceTask) {
  return data?.content?.video_url || data?.content?.file_url || data?.video_url || data?.url || "";
}
