/**
 * 以固定的並行上限執行 worker，回傳結果保持與輸入相同順序。
 * 任何一個 worker 拋錯時，整體會 reject（其餘進行中的工作仍會完成後才結束）。
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const max = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: max }, run));
  return results;
}
