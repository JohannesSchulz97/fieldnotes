/** Placeholder for a page while it renders on the server, so navigation shows at once. */
export function PageSkeleton({ title, rows = 8 }: { title?: string; rows?: number }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8" aria-busy="true">
      {title ? (
        <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
      ) : (
        <div className="mb-6 h-8 w-48 animate-pulse rounded-md bg-muted" />
      )}
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-6 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    </main>
  );
}
