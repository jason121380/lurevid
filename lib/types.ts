export type StoryboardBeat = {
  sceneNumber: number;
  title: string;
  visualGoal: string;
};

export type StoryboardScene = {
  sceneNumber: number;
  title: string;
  visualGoal: string;
  imagePrompt: string;
  seedancePrompt: string;
};

export type ProjectSettings = {
  ratio: string;
  resolution: string;
  duration: number;
};
