"use client";

import { ExtractionView } from "@/components/extraction-view";
import { ReadView } from "@/components/read-view";
import type { AnkiSettings, ExtractionResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useStoredChoice } from "@/lib/use-stored-choice";

const TABS = ["words", "read"] as const;
type Tab = (typeof TABS)[number];

export function ExtractionTabs({
  result,
  ankiSettings,
}: {
  result: ExtractionResult;
  ankiSettings: AnkiSettings;
}) {
  const [tab, setTab] = useStoredChoice<Tab>("extraction-tab", TABS, "words");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-6 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 border-transparent pb-2 text-sm text-muted-foreground hover:text-foreground",
              tab === t && "border-foreground font-medium text-foreground"
            )}
          >
            {t === "words" ? "Words" : "Read"}
          </button>
        ))}
      </div>
      {/* Both stay mounted so marking progress in the word list survives tab switches. */}
      <div className={cn(tab !== "words" && "hidden")}>
        <ExtractionView result={result} ankiSettings={ankiSettings} />
      </div>
      <div className={cn(tab !== "read" && "hidden")}>
        <ReadView
          extractionId={result.id}
          paragraphs={result.paragraphs}
          translations={result.translations}
        />
      </div>
    </div>
  );
}
