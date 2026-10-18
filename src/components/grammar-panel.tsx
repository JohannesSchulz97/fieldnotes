"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Highlighted } from "@/components/highlighted";
import { saveGrammarAnalysis } from "@/app/actions";
import type { GrammarAnalysis } from "@/lib/types";

/** The grammar analysis of a selected span, docked at the bottom of the screen. */
export function GrammarPanel({
  extractionId,
  sentence,
  span,
  analysis,
  error,
  onClose,
}: {
  extractionId: string;
  sentence: number;
  span: string;
  /** Null while the analysis is loading. */
  analysis: GrammarAnalysis | null;
  error: string | null;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    if (!analysis) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveGrammarAnalysis(extractionId, sentence, span, analysis);
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside
      aria-label="Grammar analysis"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-h-[60vh] max-w-3xl flex-col gap-3 overflow-y-auto rounded-xl border bg-background p-4 shadow-lg"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Grammar of <span className="italic text-foreground">“{span}”</span>
        </p>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !analysis ? (
        <p className="text-sm text-muted-foreground">Analysing…</p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{analysis.name}</h2>
            <p className="text-sm">{analysis.explanation}</p>
          </div>
          {analysis.note && (
            <p className="border-l-2 pl-3 text-sm text-muted-foreground">{analysis.note}</p>
          )}
          {analysis.examples.length > 0 && (
            <ul className="flex flex-col gap-2 text-sm">
              {analysis.examples.map((e, i) => (
                <li key={i}>
                  <div className="italic text-muted-foreground">
                    <Highlighted text={e.sentence} part={e.form} />
                  </div>
                  <div className="text-xs text-muted-foreground">{e.translation}</div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-end gap-3">
            {saveError && <span className="text-sm text-destructive">{saveError}</span>}
            {saved ? (
              <span className="text-sm text-muted-foreground">
                Saved to{" "}
                <Link href="/grammar" className="underline hover:text-foreground">
                  Grammar
                </Link>
              </span>
            ) : (
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save to grammar list"}
              </Button>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
