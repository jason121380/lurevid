import { describe, expect, it } from "vitest";
import { activeStepError, buildProcessSteps, type Project } from "@/lib/project-state";

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

describe("process step states", () => {
  const uploadedProject: Project = {
    id: "project-2",
    // 上傳影片的專案不會有 sourceVideoUrl（worker 直接分析本機檔案）。
    sourcePlatform: "上傳影片",
    status: "ANALYSIS_READY",
    message: "分析完成",
    progress: 0.2,
    sourceTranscript: "逐字稿",
    sourceFrameUrls: ["/generated/f1.jpg"],
    analysis: "分析",
    steps: {
      source: { status: "done", progress: 1 },
      transcribe: { status: "done", progress: 1 },
      frames: { status: "done", progress: 1 },
      analyze: { status: "done", progress: 1 }
    },
    scenes: []
  };

  it("marks 影片下載 done for uploaded videos that have no sourceVideoUrl", () => {
    expect(buildProcessSteps(uploadedProject)[0].state).toBe("done");
  });

  it("still reports a failed download step even when worker recorded progress", () => {
    const failed: Project = {
      ...uploadedProject,
      steps: { ...uploadedProject.steps, source: { status: "failed", progress: 1, message: "影片下載失敗" } }
    };
    expect(buildProcessSteps(failed)[0].state).toBe("failed");
    expect(buildProcessSteps(failed)[0].errorMessage).toBe("影片下載失敗");
  });

  it("keeps 影片下載 waiting when nothing has run yet", () => {
    const fresh: Project = { ...uploadedProject, steps: {}, sourceTranscript: undefined, sourceFrameUrls: undefined, analysis: undefined };
    expect(buildProcessSteps(fresh)[0].state).toBe("waiting");
  });
});

describe("failed step attribution", () => {
  const base: Project = {
    id: "project-3",
    status: "FAILED",
    message: "任務失敗",
    progress: 0.1,
    error: "轉錄結果為空",
    scenes: []
  };

  it("blames 轉錄音訊 when frames exist but the transcript does not", () => {
    const project: Project = { ...base, sourceFrameUrls: ["/generated/f1.jpg"] };
    expect(activeStepError(project, 2)).toBe("轉錄結果為空");
    expect(activeStepError(project, 3)).toBe("");
  });

  it("blames 抽取影格 when the transcript exists but frames do not", () => {
    const project: Project = { ...base, sourceTranscript: "逐字稿" };
    expect(activeStepError(project, 3)).toBe("轉錄結果為空");
    expect(activeStepError(project, 2)).toBe("");
  });
});
