import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "lurevid",
    short_name: "lurevid",
    description: "貼上 TikTok 連結，自動分析、改編、分鏡並生成影片。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafafa",
    theme_color: "#ff6b2c",
    categories: ["productivity", "photo", "video"],
    lang: "zh-Hant",
    icons: [
      {
        src: "/favicon.png",
        sizes: "32x32",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/app-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/app-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ],
    shortcuts: [
      {
        name: "新增專案",
        short_name: "新增",
        description: "建立新的 TikTok 分析專案",
        url: "/",
        icons: [{ src: "/app-icon.png", sizes: "512x512", type: "image/png" }]
      },
      {
        name: "健康檢查",
        short_name: "健康",
        description: "查看系統與資源狀態",
        url: "/health",
        icons: [{ src: "/app-icon.png", sizes: "512x512", type: "image/png" }]
      }
    ]
  };
}
