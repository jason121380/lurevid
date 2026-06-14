import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "lurevid | AI 影像大師",
  description: "輸入想法，自動分鏡、生成並合成 Seedance 影片。"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
