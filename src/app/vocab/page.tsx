import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { connection } from "next/server";
import { BulkAdd } from "@/components/bulk-add";
import { UnmarkButton } from "@/components/unmark-button";
import { getTotalCost } from "@/lib/db/usage";
import { countBySource, listVocab } from "@/lib/db/vocab";
import { formatUsd } from "@/lib/format";
import { formatLemma } from "@/lib/format-lemma";
import { cn } from "@/lib/utils";
import type { WordSource } from "@/lib/types";

const PAGE_SIZE = 100;

const SOURCES: { value: WordSource; label: string }[] = [
  { value: "extraction", label: "Extraction" },
  { value: "manual", label: "Added" },
  { value: "anki", label: "Anki deck" },
  { value: "basic", label: "Basic" },
];

export default async function VocabPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  const params = await searchParams;
  const source = SOURCES.find((s) => s.value === params.source)?.value;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(1, Number(params.page) || 1);
  const [{ entries, total }, counts, totalCost] = await Promise.all([
    listVocab({ source, query: query || undefined, page, pageSize: PAGE_SIZE }),
    countBySource(),
    getTotalCost(),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Link to /vocab with the current filters, overridden by the given values. */
  const href = (next: { source?: WordSource | null; page?: number }) => {
    const sp = new URLSearchParams();
    const s = next.source === undefined ? source : next.source;
    if (s) sp.set("source", s);
    if (query) sp.set("q", query);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    const qs = sp.toString();
    return qs ? `/vocab?${qs}` : "/vocab";
  };
  const filters = [
    { value: undefined, label: "All", n: Object.values(counts).reduce((a, b) => a + b, 0) },
    ...SOURCES.map((s) => ({ ...s, n: counts[s.value] })),
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Vocabulary</h1>
        <p className="text-sm text-muted-foreground">
          Total API cost {formatUsd(totalCost)}
        </p>
      </div>
      <div className="mb-8">
        <BulkAdd />
      </div>
      <form action="/vocab" className="mb-4 flex gap-2">
        {source && <input type="hidden" name="source" value={source} />}
        <input
          name="q"
          defaultValue={query}
          placeholder="Search lemma or translation…"
          className="h-9 w-full max-w-sm rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </form>
      <nav className="mb-4 flex flex-wrap gap-4 text-sm">
        {filters.map(({ value, label, n }) => (
          <Link
            key={label}
            href={href({ source: value ?? null, page: 1 })}
            className={cn(
              "text-muted-foreground hover:text-foreground",
              value === source && "font-medium text-foreground"
            )}
          >
            {label} <span className="text-muted-foreground">{n}</span>
          </Link>
        ))}
      </nav>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lemma</TableHead>
            <TableHead>Translation</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Exported</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                {query
                  ? "No matching words."
                  : "No words yet. Add known words above, or mark words on the Extract page."}
              </TableCell>
            </TableRow>
          )}
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatLemma(entry.language, entry)}</span>
                  {entry.kind === "expression" && (
                    <Badge variant="secondary">expr.</Badge>
                  )}
                </div>
                {entry.partOfSpeech && (
                  <div className="text-xs text-muted-foreground">
                    {entry.partOfSpeech}
                  </div>
                )}
              </TableCell>
              <TableCell>{entry.translation ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={entry.status === "known" ? "default" : "outline"}>
                  {entry.status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {SOURCES.find((s) => s.value === entry.source)?.label}
              </TableCell>
              <TableCell>{entry.exportedAt ? entry.exportedAt.slice(0, 10) : "—"}</TableCell>
              <TableCell>{entry.createdAt.slice(0, 10)}</TableCell>
              <TableCell className="text-right">
                <UnmarkButton language={entry.language} lemma={entry.lemma} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pageCount > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-4">
            {page > 1 ? (
              <Link href={href({ page: page - 1 })} className="hover:text-foreground">
                ← Previous
              </Link>
            ) : (
              <span className="opacity-40">← Previous</span>
            )}
            <span>
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? (
              <Link href={href({ page: page + 1 })} className="hover:text-foreground">
                Next →
              </Link>
            ) : (
              <span className="opacity-40">Next →</span>
            )}
          </div>
        </nav>
      )}
    </main>
  );
}
