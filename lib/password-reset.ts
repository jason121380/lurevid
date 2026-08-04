import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const RESET_TOKEN_TTL_MINUTES = 60;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

/** 只有雜湊會進資料庫：DB 外洩時無法還原出可用的重設連結。 */
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createResetToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

/**
 * 建立重設票證，並讓同一個帳號的舊票證失效
 * （避免使用者連按多次後，好幾封信同時有效）。
 */
export async function issueResetToken(userId: string) {
  const { token, tokenHash } = createResetToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } })
  ]);

  return { token, expiresAt };
}

/** 找出仍然有效的票證；過期、用過或不存在都回 null。 */
export async function findUsableResetToken(token: string) {
  if (!token) return null;
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true } } }
  });
  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;
  return record;
}

/**
 * 消耗票證並換上新密碼。用 updateMany + usedAt: null 當作條件，
 * 讓「同一條連結同時被按兩次」只有一次會成功。
 */
export async function consumeResetToken(tokenId: string, userId: string, password: string) {
  const claimed = await prisma.passwordResetToken.updateMany({
    where: { id: tokenId, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() }
  });
  if (claimed.count === 0) return false;

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 12) }
  });
  // 換完密碼就清掉這個帳號其餘的票證。
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
  return true;
}

/** 重設連結一律用伺服器自己的設定組出來，不能相信請求的 Host（避免被塞入釣魚網域）。 */
export function resetUrlFor(token: string) {
  const base = (process.env.NEXTAUTH_URL || process.env.AUTH_URL || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("缺少 NEXTAUTH_URL，無法產生重設連結");
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}
