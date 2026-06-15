import { NextResponse } from "next/server";

export const runtime = "nodejs";

// 公開健康檢查端點（middleware 不攔截 /api）；給部署平台做存活探測。
export function GET() {
  return NextResponse.json({ ok: true });
}
