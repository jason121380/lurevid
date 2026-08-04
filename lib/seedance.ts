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

export function toSeedanceTaskCreationError(error: unknown) {
  // 一律用 cause 帶著上游原文：使用者看到的是翻譯過的訊息，
  // 但排查時仍然找得到 Seedance 到底說了什麼。
  if (isSeedancePrivacyImageError(error)) {
    return new Error(
      "Seedance 內容審核判定參考圖含有真人，因此拒絕生成。請回到第 6 步重新產生分鏡（避免清晰正面人臉，例如改用背影、手部特寫或料理特寫），再重新合併分鏡後生成。",
      { cause: error }
    );
  }
  if (error instanceof SeedanceApiError && error.status === 404) {
    return new Error(
      "Seedance 建立任務失敗 (404)：請檢查 ARK_API_KEY 權限/區域與 SEEDANCE_MODEL 是否正確",
      { cause: error }
    );
  }
  return error;
}

/** 取出上游原文（含被包在 cause 裡的），只給伺服器日誌用，不要顯示給使用者。 */
export function seedanceUpstreamDetail(error: unknown): string {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  if (cause instanceof SeedanceApiError) return `[${cause.status}] ${cause.message}`;
  if (cause instanceof Error) return cause.message;
  return String(cause ?? "");
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
