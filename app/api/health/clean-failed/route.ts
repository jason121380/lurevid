import { NextResponse } from "next/server";
import { createProjectQueue } from "@/lib/queue";
import { requireAdmin, isResponse } from "@/lib/authz";

export const runtime = "nodejs";

// 清掉佇列裡累積的失敗/完成紀錄（admin-only）。
export async function POST() {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const queue = createProjectQueue();
  try {
    const [failed, completed] = await Promise.all([
      queue.clean(0, 5000, "failed"),
      queue.clean(0, 5000, "completed")
    ]);
    return NextResponse.json({ ok: true, removed: { failed: failed.length, completed: completed.length } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "清除失敗" }, { status: 500 });
  } finally {
    await queue.close();
  }
}
