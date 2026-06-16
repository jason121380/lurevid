export default function ProjectLoading() {
  return (
    <div className="min-h-screen bg-[var(--warm-white)]">
      <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-[325px_minmax(0,1fr)] md:gap-4 md:p-6">
        <aside className="space-y-4 md:sticky md:top-6 md:h-fit">
          <div className="rounded-xl bg-white p-3">
            <div className="h-5 w-20 rounded-full bg-[var(--border)]" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 8 }, (_, index) => (
                <div className="flex items-center gap-3" key={index}>
                  <div className="h-7 w-7 rounded-full bg-[var(--border)]" />
                  <div className="h-4 flex-1 rounded-full bg-[var(--border)]" />
                </div>
              ))}
            </div>
          </div>
          <div className="aspect-[9/16] rounded-xl bg-[var(--border)]" />
        </aside>
        <section className="min-w-0">
          <div className="rounded-xl border border-[var(--border)] bg-white p-4">
            <div className="h-5 w-32 rounded-full bg-[var(--border)]" />
            <div className="mt-5 space-y-3">
              <div className="h-4 w-full rounded-full bg-[var(--border)]" />
              <div className="h-4 w-4/5 rounded-full bg-[var(--border)]" />
              <div className="h-4 w-2/3 rounded-full bg-[var(--border)]" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
