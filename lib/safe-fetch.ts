import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const DEFAULT_FETCH_TIMEOUT_MS = Number(process.env.SAFE_FETCH_TIMEOUT_MS || 30000);
const DEFAULT_MAX_REDIRECTS = Number(process.env.SAFE_FETCH_MAX_REDIRECTS || 3);
export const DEFAULT_MAX_DOWNLOAD_BYTES = Number(process.env.SAFE_FETCH_MAX_BYTES || 500 * 1024 * 1024);

function isPrivateIPv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIPv6(ip: string) {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("::ffff:")) return isPrivateIPv4(lower.replace("::ffff:", ""));
  return false;
}

function isPrivateAddress(ip: string) {
  return isIP(ip) === 6 ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

/**
 * 確認一個（通常由上游 API 回傳的）URL 可以安全地 fetch：
 * 必須是 http(s)，且解析後的 IP 不可指向 loopback / 內網 / 雲端 metadata，避免 SSRF。
 */
export async function assertSafeRemoteUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("無效的下載連結");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("只允許 http(s) 連結");
  }

  const host = parsed.hostname;
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("拒絕存取內網位址");
    return;
  }

  const resolved = await lookup(host, { all: true });
  if (resolved.length === 0) throw new Error("無法解析下載連結網域");
  for (const { address } of resolved) {
    if (isPrivateAddress(address)) throw new Error("拒絕存取內網位址");
  }
}

export type SafeFetchOptions = RequestInit & {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
};

function contentLengthWithinLimit(response: Response, maxBytes: number) {
  const raw = response.headers.get("content-length");
  if (!raw) return true;
  const length = Number(raw);
  return Number.isFinite(length) && length <= maxBytes;
}

function redirectTarget(currentUrl: string, response: Response) {
  const location = response.headers.get("location");
  if (!location) throw new Error("遠端重新導向缺少 Location");
  return new URL(location, currentUrl).toString();
}

/** assertSafeRemoteUrl + fetch 的便利封裝；每次 redirect 都重新驗證，避免 SSRF 繞過。 */
export async function safeFetch(url: string, init?: SafeFetchOptions) {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const maxRedirects = init?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBytes = init?.maxBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
  let currentUrl = url;

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    await assertSafeRemoteUrl(currentUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(currentUrl, {
        ...init,
        redirect: "manual",
        signal: init?.signal ?? controller.signal
      });

      if (response.status >= 300 && response.status < 400) {
        if (redirects === maxRedirects) throw new Error("遠端重新導向次數過多");
        currentUrl = redirectTarget(currentUrl, response);
        continue;
      }

      if (!contentLengthWithinLimit(response, maxBytes)) {
        throw new Error("下載檔案超過大小限制");
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("遠端重新導向次數過多");
}
