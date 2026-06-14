import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "lurevid | 短影音分析創作平台",
  description: "貼上 IG Reels / TikTok 連結，自動分析、改編、分鏡並生成影片。"
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
