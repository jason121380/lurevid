import { describe, expect, it } from "vitest";
import { SeedanceApiError, toSeedanceTaskCreationError } from "@/lib/seedance";

describe("Seedance task errors", () => {
  it("fails instead of falling back when the reference image is rejected", () => {
    const error = new SeedanceApiError("InputImagesSensitiveContentDetected: input image may contain real person", 400);
    const mapped = toSeedanceTaskCreationError(error);

    expect(mapped).toBeInstanceOf(Error);
    expect((mapped as Error).message).toBe("Seedance 拒絕參考圖，請調整或重新合併分鏡圖後再生成影片");
  });
});
