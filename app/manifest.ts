import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "lurevid",
    short_name: "lurevid",
    description: "貼上 TikTok 連結，自動分析、改編、分鏡並生成影片。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#fafafa",
    theme_color: "#ff6b2c",
    categories: ["productivity", "photo", "video"],
    lang: "zh-Hant",
    icons: [
      {
        src: "/favicon-v3.png",
        sizes: "32x32",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/app-icon-v3.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/app-icon-v3.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ],
    shortcuts: [
      {
        name: "新增專案",
        short_name: "新增",
        description: "建立新的影片分析專案",
        url: "/",
        icons: [{ src: "/app-icon-v3.png", sizes: "512x512", type: "image/png" }]
      },
      {
        name: "我的專案",
        short_name: "專案",
        description: "查看所有分析專案",
        url: "/projects",
        icons: [{ src: "/app-icon-v3.png", sizes: "512x512", type: "image/png" }]
      }
    ]
  };
}
