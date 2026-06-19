"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        // updateViaCache: "none" 讓瀏覽器每次都重新驗證 sw.js，避免 HTTP 快取卡住舊版 SW。
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // PWA enhancement only. App should keep working if registration fails.
        });
    };

    // 首次安裝時本來就沒有 controller，不該重整；只有「既有 SW 被新版取代」才重整一次。
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshed = false;
    const onControllerChange = () => {
      if (!hadController || refreshed) return;
      refreshed = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
