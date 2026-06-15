import ffmpegStatic from "ffmpeg-static";

/** 一致的 ffmpeg 二進位來源：env 覆寫 → 打包的 ffmpeg-static → 系統 PATH。 */
export function ffmpegPath() {
  return process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
}
