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
import { countBySource, listVocab } from "@/lib/db/vocab";
import { cn } from "@/lib/utils";
import type { WordSource } from "@/lib/types";

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
  const param = (await searchParams).source;
  const source = SOURCES.find((s) => s.value === param)?.value;
  const [entries, counts] = await Promise.all([listVocab(source), countBySource()]);
  const filters = [
    { value: undefined, label: "All", n: Object.values(counts).reduce((a, b) => a + b, 0) },
    ...SOURCES.map((s) => ({ ...s, n: counts[s.value] })),
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Vocabulary</h1>
      <div className="mb-8">
        <BulkAdd />
      </div>
      <nav className="mb-4 flex flex-wrap gap-4 text-sm">
        {filters.map(({ value, label, n }) => (
          <Link
            key={label}
            href={value ? `/vocab?source=${value}` : "/vocab"}
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
                No words yet. Add known words above, or mark words on the Extract page.
              </TableCell>
            </TableRow>
          )}
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{entry.lemma}</span>
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
    </main>
  );
}
