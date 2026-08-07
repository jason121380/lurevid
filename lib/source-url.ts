type Platform = {
  name: "YouTube" | "TikTok" | "Instagram";
  hosts: string[];
  accepts: (url: URL) => boolean;
};

const hasPathId = (parsed: URL, prefix: RegExp) => prefix.test(parsed.pathname);

const PLATFORMS: Platform[] = [
  {
    name: "YouTube",
    hosts: ["youtube.com"],
    accepts: (parsed) =>
      (parsed.pathname === "/watch" && Boolean(parsed.searchParams.get("v"))) ||
      hasPathId(parsed, /^\/(shorts|live)\/[^/]+\/?$/i)
  },
  { name: "YouTube", hosts: ["youtu.be"], accepts: (parsed) => /^\/[^/]+\/?$/.test(parsed.pathname) },
  {
    name: "TikTok",
    hosts: ["tiktok.com"],
    accepts: (parsed) =>
      hasPathId(parsed, /^\/@[^/]+\/video\/[^/]+\/?$/) ||
      // 短連結：/t/<id> 是網頁版「複製連結」，/v/<id>.html 是舊版行動網頁。
      hasPathId(parsed, /^\/t\/[^/]+\/?$/i) ||
      hasPathId(parsed, /^\/v\/[^/]+\.html$/i)
  },
  {
    // TikTok App 的「複製連結」給的就是這兩個網域，路徑只有一個不透明 ID。
    // 這是手機使用者最常貼進來的形狀，缺了等於大部分 TikTok 連結都貼不進來。
    name: "TikTok",
    hosts: ["vm.tiktok.com", "vt.tiktok.com"],
    accepts: (parsed) => /^\/[^/]+\/?$/.test(parsed.pathname)
  },
  {
    name: "Instagram",
    // /reel/<id> 與 /reels/<id>，另含 IG 有時會帶上作者的 /<user>/reel/<id>。
    hosts: ["instagram.com"],
    accepts: (parsed) => /^\/(?:[^/]+\/)?reels?\/[^/]+\/?$/i.test(parsed.pathname)
  }
];

function matchPlatform(parsed: URL) {
  const host = parsed.hostname.toLowerCase();
  return PLATFORMS.find(
    (platform) =>
      platform.hosts.some((base) => host === base || host.endsWith(`.${base}`)) && platform.accepts(parsed)
  );
}

function parseAllowedUrl(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return matchPlatform(parsed) ? parsed : null;
}

export function detectPlatform(url: string): Platform["name"] | "Unknown" {
  const parsed = parseAllowedUrl(url);
  return parsed ? matchPlatform(parsed)?.name || "Unknown" : "Unknown";
}

/** 只接受 http(s) 的支援來源影片連結。 */
export function isSupportedSourceUrl(url: string) {
  return parseAllowedUrl(url) !== null;
}

export function normalizeSourceUrl(url: string) {
  const parsed = parseAllowedUrl(url);
  return parsed ? parsed.toString() : url;
}
