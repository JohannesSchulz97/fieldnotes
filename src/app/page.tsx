import Link from "next/link";
import { connection } from "next/server";
import { ExtractForm } from "@/components/extract-form";
import { listExtractions } from "@/lib/db/extractions";

export default async function Home() {
  await connection();
  const past = await listExtractions();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Extract vocabulary</h1>
      <ExtractForm />

      {past.length > 0 && (
        <section className="mt-10 flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Past extractions</h2>
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
                  <span className="flex-1 truncate text-sm">{e.preview}</span>
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
