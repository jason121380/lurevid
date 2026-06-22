export default function ProjectLoading() {
  return (
    <div className="min-h-dvh bg-[var(--warm-white)]">
      <div className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)] pt-safe-top">
        <div className="mx-auto max-w-content px-3">
          <div className="flex h-appbar items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-[var(--surface-muted)]" />
            <div className="h-4 w-40 rounded-full bg-[var(--surface-muted)]" />
          </div>
          <div className="flex gap-2 py-2">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="h-8 w-24 shrink-0 rounded-full bg-[var(--surface-muted)]" key={index} />
            ))}
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-content space-y-3 px-3 pt-4">
        <div className="h-6 w-32 rounded-full bg-[var(--surface-muted)]" />
        <div className="grid grid-cols-3 gap-2.5">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="h-20 rounded-lg bg-[var(--surface-muted)]" key={index} />
          ))}
        </div>
        <div className="h-40 rounded-lg bg-[var(--surface-muted)]" />
      </main>
    </div>
  );
}
