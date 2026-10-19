import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { CreateExercises } from "@/components/create-exercises";
import { GrammarExampleLine, GrammarTags, sentenceHref } from "@/components/grammar-example";
import { GrammarItemActions } from "@/components/grammar-item-actions";
import { getActiveLanguage } from "@/lib/active-language";
import { countByCategory, countByStatus, listGrammarItems } from "@/lib/db/grammar";
import { GRAMMAR_CATEGORIES } from "@/lib/grammar";
import type { GrammarCategory, GrammarStatus } from "@/lib/types";
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
  const category = GRAMMAR_CATEGORIES.find((c) => c.value === params.category)?.value;
  const language = await getActiveLanguage();
  const [items, statusCounts, categoryCounts] = await Promise.all([
    listGrammarItems({ language, status, category }),
    countByStatus(language),
    countByCategory(language),
  ]);

  /** Link to /grammar with the current filters, overridden by the given values. */
  const href = (next: { status?: GrammarStatus | null; category?: GrammarCategory | null }) => {
    const sp = new URLSearchParams();
    const s = next.status === undefined ? status : next.status;
    const c = next.category === undefined ? category : next.category;
    if (s) sp.set("status", s);
    if (c) sp.set("category", c);
    const qs = sp.toString();
    return qs ? `/grammar?${qs}` : "/grammar";
  };
  const statusFilters = [
    { value: undefined, label: "All", n: statusCounts.to_work_on + statusCounts.learned },
    ...STATUSES.map((s) => ({ ...s, n: statusCounts[s.value] })),
  ];
  const categoryFilters = [
    { value: undefined, label: "All areas" },
    ...GRAMMAR_CATEGORIES.filter((c) => categoryCounts.has(c.value)),
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Grammar</h1>
      <nav className="mb-3 flex flex-wrap gap-4 text-sm">
        {statusFilters.map(({ value, label, n }) => (
          <Link
            key={label}
            href={href({ status: value ?? null })}
            className={cn(
              "text-muted-foreground hover:text-foreground",
              value === status && "font-medium text-foreground"
            )}
          >
            {label} <span className="text-muted-foreground">{n}</span>
          </Link>
        ))}
      </nav>
      {categoryFilters.length > 2 && (
        <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {categoryFilters.map(({ value, label }) => (
            <Link
              key={label}
              href={href({ category: value ?? null })}
              className={cn(
                "text-muted-foreground hover:text-foreground",
                value === category && "font-medium text-foreground"
              )}
            >
              {label}
              {value && <span className="text-muted-foreground"> {categoryCounts.get(value)}</span>}
            </Link>
          ))}
        </nav>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {status || category
            ? "No items here."
            : "No grammar saved yet. Select words in an extraction (Read tab or example sentences) to analyse them."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{item.name}</h2>
                    <GrammarTags level={item.level} category={item.category} />
                    {item.status === "learned" && <Badge variant="outline">learned</Badge>}
                  </div>
                  <p className="max-w-3xl text-sm">{item.explanation}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <GrammarItemActions id={item.id} status={item.status} />
                  <CreateExercises grammarItemId={item.id} />
                </div>
              </div>
              <ul className="flex max-w-3xl flex-col gap-2 text-sm">
                {item.examples.map((e) => (
                  <GrammarExampleLine
                    key={e.id}
                    sentence={e.sentence}
                    form={e.form}
                    translation={e.translation}
                    href={
                      e.extractionId && e.sentenceIndex !== null
                        ? sentenceHref(e.extractionId, e.sentenceIndex)
                        : null
                    }
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
