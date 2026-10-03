import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { connection } from "next/server";
import { listVocab } from "@/lib/db/vocab";

export default async function VocabPage() {
  await connection();
  const entries = await listVocab();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Vocabulary</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lemma</TableHead>
            <TableHead>Translation</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Exported</TableHead>
            <TableHead>Added</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No words yet. Mark words as known or ignored on the Extract page.
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
              <TableCell>{entry.exportedAt ? entry.exportedAt.slice(0, 10) : "—"}</TableCell>
              <TableCell>{entry.createdAt.slice(0, 10)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
