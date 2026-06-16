import type { Metadata } from "next";
import "./globals.css";
import { AppFrame } from "@/components/AppFrame";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "lurevid | 短影音分析創作平台",
  description: "貼上 TikTok 連結，自動分析、改編、分鏡並生成影片。",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/app-icon.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>
        <Providers>
          <AppFrame>{children}</AppFrame>
        </Providers>
      </body>
    </html>
  );
}
