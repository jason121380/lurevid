import { describe, expect, it } from "vitest";
import { activeStepError, type Project } from "@/lib/project-state";

function projectWithStep(stepStatus: string): Project {
  return {
    id: "project-1",
    status: "GENERATING",
    message: "正在建立 Seedance 影片任務",
    progress: 0.62,
    storyboardImageUrl: "https://example.com/storyboard.png",
    steps: {
      video: {
        status: stepStatus,
        progress: 0.62,
        message: "正在建立 Seedance 影片任務"
      }
    },
    scenes: []
  };
}

describe("project step errors", () => {
  it("does not show a running step status message as an error", () => {
    expect(activeStepError(projectWithStep("running"), 8)).toBe("");
  });

  it("shows a failed step message as an error", () => {
    expect(activeStepError(projectWithStep("failed"), 8)).toBe("正在建立 Seedance 影片任務");
  });
});
