import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * 管理用：直接重設某個帳號的密碼。需要能連到目標資料庫（DATABASE_URL）。
 *
 *   npm run set-password -- you@example.com          # 產生一組隨機密碼並印出來
 *   NEW_PASSWORD=... npm run set-password -- you@... # 指定密碼
 *
 * 這是「忘記密碼且信件管道不可用」時的最後手段。
 * 不用互動式輸入：在非 TTY（CI、`docker exec`、管線）下讀 stdin 會靜默失敗。
 */
const MIN_PASSWORD_LENGTH = 8;

/** 去掉容易看錯的字元（0/O、1/l/I），方便從終端機抄到瀏覽器。 */
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generatePassword(length = 16) {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email) {
    console.error("用法：npm run set-password -- <email>");
    process.exitCode = 1;
    return;
  }

  const provided = process.env.NEW_PASSWORD?.trim();
  if (provided && provided.length < MIN_PASSWORD_LENGTH) {
    console.error(`NEW_PASSWORD 至少要 ${MIN_PASSWORD_LENGTH} 個字元`);
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) {
    console.error(`找不到帳號：${email}`);
    process.exitCode = 1;
    return;
  }

  const password = provided || generatePassword();
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 12) }
  });

  // 同時讓所有既有的重設連結失效，避免舊信件還能改密碼。
  // 先確認資料表存在：還沒跑過 db:push 的環境也要能用這個工具救回帳號。
  const [{ ready }] = await prisma.$queryRaw<Array<{ ready: boolean }>>`
    select to_regclass('public."PasswordResetToken"') is not null as ready
  `;
  if (ready) await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  console.log(`已更新 ${user.email} 的密碼。`);
  if (!provided) {
    console.log(`新密碼：${password}`);
    console.log("請登入後到「我的 → 變更密碼」改成自己記得的密碼。");
  }
}

main()
  .catch((error) => {
    console.error("重設密碼失敗：", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
