import { NextResponse } from "next/server";
import type { Project } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currentUser, type SessionUser } from "@/lib/authz";

/**
 * 載入並驗證使用者擁有的專案。未登入回 401、非擁有者/不存在回 404。
 * 呼叫端用 `value instanceof NextResponse` 判斷錯誤。
 */
export async function loadOwnedProject(
  id: string
): Promise<{ user: SessionUser; project: Project } | NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: "找不到專案" }, { status: 404 });
  }

  return { user, project };
}
