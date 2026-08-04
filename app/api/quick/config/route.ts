import { NextResponse } from "next/server";
import { currentUser } from "@/lib/authz";
import { getAppSettings } from "@/lib/settings";

export const runtime = "nodejs";

/**
 * 快速使用頁上的模型標籤。只回傳模型名稱（非機密），
 * 這樣標籤永遠反映實際設定，不會寫死之後跟現實脫節。
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const settings = await getAppSettings();
  return NextResponse.json({
    imageModel: settings.OPENAI_IMAGE_MODEL || "gpt-image-2",
    videoModel: settings.SEEDANCE_MODEL || "dreamina-seedance-2-0-260128"
  });
}
