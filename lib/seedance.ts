export type SeedanceSettings = {
  ratio: string;
  resolution: string;
  duration: number;
};

const BYTEPLUS_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";

export async function createSeedanceTask(prompt: string, settings: SeedanceSettings, imageUrl?: string | null) {
  if (!process.env.ARK_API_KEY || process.env.ARK_API_KEY.startsWith("replace-with")) {
    throw new Error("請先在 .env 設定有效的 ARK_API_KEY");
  }
  const response = await fetch(`${BYTEPLUS_BASE_URL}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.SEEDANCE_MODEL || "dreamina-seedance-2-0-fast-260128",
      content: [
        { type: "text", text: prompt },
        ...(imageUrl ? [{ type: "image", url: imageUrl }] : [])
      ],
      ratio: settings.ratio,
      resolution: settings.resolution,
      duration: settings.duration
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Seedance 建立任務失敗 (${response.status})`);
  return data;
}

export async function getSeedanceTask(taskId: string) {
  if (!process.env.ARK_API_KEY) throw new Error("缺少 ARK_API_KEY");
  const response = await fetch(`${BYTEPLUS_BASE_URL}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
    headers: {
      Authorization: `Bearer ${process.env.ARK_API_KEY}`
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Seedance 查詢任務失敗 (${response.status})`);
  return data;
}

export function extractSeedanceVideoUrl(data: any) {
  return data?.content?.video_url || data?.content?.file_url || data?.video_url || data?.url || "";
}
