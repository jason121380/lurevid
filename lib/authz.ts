import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { emailIsAdmin } from "@/lib/auth.config";

export type SessionUser = {
  id: string;
  email?: string | null;
  isAdmin: boolean;
};

/** 取得目前登入使用者；未登入回 null。 */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    isAdmin: Boolean(session.user.isAdmin) || emailIsAdmin(session.user.email)
  };
}

/** API 用：未登入回 401 response，否則回使用者。呼叫端需判斷型別。 */
export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  return user;
}

/** API 用：非管理員回 403 response，否則回使用者。 */
export async function requireAdmin(): Promise<SessionUser | NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "需要管理員權限" }, { status: 403 });
  return user;
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
