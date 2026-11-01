import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ActiveLanguageSync } from "@/components/active-language-sync";
import { ExtractionTabs } from "@/components/extraction-tabs";
import { SourceDetails } from "@/components/source-details";
import { ReextractButton } from "@/components/reextract-button";
import { TranslateButton } from "@/components/translate-button";
import { getActiveLanguage } from "@/lib/active-language";
import { loadExtraction } from "@/lib/db/extractions";
import { getAnkiSettings } from "@/lib/db/settings";
import { getTotalCost } from "@/lib/db/usage";
import { formatUsd } from "@/lib/format";

export default async function ExtractionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  const { id } = await params;
  const { sentence } = await searchParams;
  const focusSentence =
    typeof sentence === "string" && /^\d+$/.test(sentence) ? Number(sentence) : null;
  const [result, totalCost, ankiSettings, activeLanguage] = await Promise.all([
    loadExtraction(id),
    getTotalCost(),
    getAnkiSettings(),
    getActiveLanguage(),
  ]);
  if (!result) notFound();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <ActiveLanguageSync language={result.sourceLanguage} active={activeLanguage} />
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← All sources
        </Link>
        <div className="flex items-start justify-between gap-4">
          <SourceDetails
            key={`${result.title}|${result.sourceUrl}`}
            id={result.id}
            title={result.title}
            sourceUrl={result.sourceUrl}
            fallbackTitle={`Source ${result.createdAt.slice(0, 10)}`}
          />
          {/* The exercises source is assembled from exercises: translated already, nothing to re-extract. */}
          {result.kind === "text" && (
            <div className="flex shrink-0 gap-2">
              {!result.translations && <TranslateButton id={result.id} />}
              {result.translations && !result.glosses && <TranslateButton id={result.id} glossOnly />}
              <ReextractButton id={result.id} />
            </div>
          )}
        </div>
        {result.kind === "text" && (
          <p className="text-xs text-muted-foreground">
            Cost {formatUsd(result.costUsd)} · total spent {formatUsd(totalCost)}
          </p>
        )}
      </div>
      {/* Keyed by updatedAt so a re-extraction or translation resets the local list state. */}
      <ExtractionTabs
        key={result.updatedAt}
        result={result}
        ankiSettings={ankiSettings}
        focusSentence={focusSentence}
      />
    </main>
  );
}
