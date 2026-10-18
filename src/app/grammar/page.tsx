import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { GrammarItemActions } from "@/components/grammar-item-actions";
import { Highlighted } from "@/components/highlighted";
import { countByStatus, listGrammarItems } from "@/lib/db/grammar";
import type { GrammarExample, GrammarStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUSES: { value: GrammarStatus; label: string }[] = [
  { value: "to_work_on", label: "To work on" },
  { value: "learned", label: "Learned" },
];

export default async function GrammarPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  const params = await searchParams;
  const status = STATUSES.find((s) => s.value === params.status)?.value;
  const [items, counts] = await Promise.all([listGrammarItems(status), countByStatus()]);
  const filters = [
    { value: undefined, label: "All", n: counts.to_work_on + counts.learned },
    ...STATUSES.map((s) => ({ ...s, n: counts[s.value] })),
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Grammar</h1>
      <nav className="mb-6 flex flex-wrap gap-4 text-sm">
        {filters.map(({ value, label, n }) => (
          <Link
            key={label}
            href={value ? `/grammar?status=${value}` : "/grammar"}
            className={cn(
              "text-muted-foreground hover:text-foreground",
              value === status && "font-medium text-foreground"
            )}
          >
            {label} <span className="text-muted-foreground">{n}</span>
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {status
            ? "No items here."
            : "No grammar saved yet. Select words in the Read tab of an extraction to analyse them."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{item.name}</h2>
                    {item.status === "learned" && <Badge variant="outline">learned</Badge>}
                  </div>
                  <p className="max-w-3xl text-sm">{item.explanation}</p>
                </div>
                <GrammarItemActions id={item.id} status={item.status} />
              </div>
              <ExampleList title="From your texts" examples={item.examples.filter((e) => e.origin === "source")} />
              <ExampleList title="Examples" examples={item.examples.filter((e) => e.origin === "generated")} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function ExampleList({ title, examples }: { title: string; examples: GrammarExample[] }) {
  if (examples.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="flex max-w-3xl flex-col gap-2 text-sm">
        {examples.map((e) => (
          <li key={e.id}>
            <div className="italic text-muted-foreground">
              <Highlighted text={e.sentence} part={e.form} />
              {e.extractionId && (
                <Link
                  href={`/extractions/${e.extractionId}`}
                  className="ml-2 text-xs not-italic underline hover:text-foreground"
                >
                  text
                </Link>
              )}
            </div>
            {e.translation && <div className="text-xs text-muted-foreground">{e.translation}</div>}
            {e.note && <div className="mt-1 border-l-2 pl-3 text-xs">{e.note}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
