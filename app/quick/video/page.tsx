import { QuickStudio } from "../QuickStudio";

export default function QuickVideoPage() {
  return (
    <QuickStudio
      kind="VIDEO"
      title="文生影片"
      description="用一句話描述你想要的鏡頭，可以先讓 AI 補完成完整的提示詞，確認後再送出。"
      placeholder="例：鏡頭緩慢推近一碗剛端上桌的滷肉飯，蒸氣上升，暖黃燈光"
    />
  );
}
