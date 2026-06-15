import type { NextAuthConfig } from "next-auth";

function adminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function emailIsAdmin(email?: string | null) {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

/**
 * Edge 安全的基礎設定：不可在此 import Prisma 或 bcrypt，
 * 因為 middleware 會在 edge runtime 載入這份設定。
 * Credentials provider（需要 Prisma/bcrypt）只放在 lib/auth.ts。
 */
export const authConfig = {
  // 非 Vercel 主機（如 Zeabur）必須信任 host，否則 Auth.js 會丟 Configuration 錯誤。
  trustHost: true,
  // Auth.js v5 預設讀 AUTH_SECRET；同時接受 NEXTAUTH_SECRET，避免少設一個就壞。
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.isAdmin = emailIsAdmin(user.email);
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) || session.user.id;
        session.user.isAdmin = Boolean(token.isAdmin);
      }
      return session;
    }
  }
} satisfies NextAuthConfig;
