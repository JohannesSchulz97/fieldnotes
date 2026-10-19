"use client";

import { useEffect } from "react";
import { ExtractionView } from "@/components/extraction-view";
import { GrammarSelection } from "@/components/grammar-selection";
import { ReadView } from "@/components/read-view";
import type { AnkiSettings, ExtractionResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useStoredChoice } from "@/lib/use-stored-choice";

const TABS = ["words", "read"] as const;
type Tab = (typeof TABS)[number];

export function ExtractionTabs({
  result,
  ankiSettings,
  focusSentence,
}: {
  result: ExtractionResult;
  ankiSettings: AnkiSettings;
  /** Opens the Read tab at this sentence (from a link to a grammar example). */
  focusSentence: number | null;
}) {
  const [tab, setTab] = useStoredChoice<Tab>("extraction-tab", TABS, "words");

  // Runs after useStoredChoice restores the stored tab, so the link's sentence wins.
  useEffect(() => {
    if (focusSentence !== null) setTab("read");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the linked sentence changes
  }, [focusSentence]);

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
      <GrammarSelection extractionId={result.id}>
        <div className={cn(tab !== "words" && "hidden")}>
          <ExtractionView result={result} ankiSettings={ankiSettings} />
        </div>
        <div className={cn(tab !== "read" && "hidden")}>
          <ReadView
            paragraphs={result.paragraphs}
            translations={result.translations}
            focusSentence={focusSentence}
            active={tab === "read"}
          />
        </div>
      </GrammarSelection>
    </div>
  );
}
