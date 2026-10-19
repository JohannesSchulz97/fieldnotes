import Link from "next/link";
import { connection } from "next/server";
import { ExtractForm } from "@/components/extract-form";
import { listExtractions } from "@/lib/db/extractions";
import { linkHost } from "@/lib/source";

export default async function Home() {
  await connection();
  const past = await listExtractions();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Sources</h1>
      <ExtractForm />

      {past.length > 0 && (
        <section className="mt-10 flex flex-col gap-2">
          <h2 className="text-lg font-semibold">All sources</h2>
          <ul className="divide-y">
            {past.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/extractions/${e.id}`}
                  className="flex items-baseline gap-4 py-2 hover:bg-muted/50"
                >
                  <span className="w-24 shrink-0 text-sm text-muted-foreground">
                    {e.createdAt.slice(0, 10)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={e.title ? "truncate text-sm font-medium" : "truncate text-sm"}>
                      {e.title ?? e.preview}
                    </span>
                    {e.sourceUrl && (
                      <span className="truncate text-xs text-muted-foreground">{linkHost(e.sourceUrl)}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {e.newCount} new / {e.totalCount}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
