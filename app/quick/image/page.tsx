import { QuickStudio } from "../QuickStudio";

export default function QuickImagePage() {
  return (
    <QuickStudio
      kind="IMAGE"
      title="文生圖"
      description="用一句話描述你想要的畫面，可以先讓 AI 補完成完整的提示詞，確認後再送出。"
      placeholder="例：清晨的台北巷弄早餐店，蒸籠冒著白煙，暖色調，淺景深"
    />
  );
}
