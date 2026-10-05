import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ExtractionView } from "@/components/extraction-view";
import { ReextractButton } from "@/components/reextract-button";
import { loadExtraction } from "@/lib/db/extractions";
import { getTotalCost } from "@/lib/db/usage";
import { formatUsd } from "@/lib/format";

export default async function ExtractionPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const [result, totalCost] = await Promise.all([loadExtraction(id), getTotalCost()]);
  if (!result) notFound();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← All extractions
        </Link>
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold">Extraction {result.createdAt.slice(0, 10)}</h1>
          <ReextractButton id={result.id} />
        </div>
        <p className="text-xs text-muted-foreground">
          Cost {formatUsd(result.costUsd)} · total spent {formatUsd(totalCost)}
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Show text</summary>
          <p className="mt-2 whitespace-pre-wrap">{result.text}</p>
        </details>
      </div>
      {/* Keyed by updatedAt so a re-extraction resets the local list state. */}
      <ExtractionView key={result.updatedAt} result={result} />
    </main>
  );
}
