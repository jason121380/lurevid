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
      hasPathId(parsed, /^\/(shorts|live)\/[^/]+/i)
  },
  { name: "YouTube", hosts: ["youtu.be"], accepts: (parsed) => /^\/[^/]+/.test(parsed.pathname) },
  { name: "TikTok", hosts: ["tiktok.com"], accepts: () => true },
  { name: "Instagram", hosts: ["instagram.com"], accepts: (parsed) => /^\/reels?\/[^/]+/i.test(parsed.pathname) }
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

/** 只接受 http(s) 的短影音來源連結。 */
export function isSupportedSourceUrl(url: string) {
  return parseAllowedUrl(url) !== null;
}

export function normalizeSourceUrl(url: string) {
  const parsed = parseAllowedUrl(url);
  return parsed ? parsed.toString() : url;
}
