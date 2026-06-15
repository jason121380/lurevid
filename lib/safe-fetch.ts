import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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

/** assertSafeRemoteUrl + fetch 的便利封裝。 */
export async function safeFetch(url: string, init?: RequestInit) {
  await assertSafeRemoteUrl(url);
  return fetch(url, init);
}
