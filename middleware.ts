import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

// 只保護「頁面」路由；API 路由各自用 lib/authz 回傳 401/403 JSON。
export default auth((req) => {
  if (req.auth?.user) return;
  const loginUrl = new URL("/login", req.nextUrl.origin);
  loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
  return Response.redirect(loginUrl);
});

export const config = {
  matcher: ["/", "/projects/:path*", "/settings/:path*"]
};
