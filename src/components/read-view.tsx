"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GrammarPanel } from "@/components/grammar-panel";
import { analyzeGrammar } from "@/app/actions";
import type { GrammarAnalysis } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useStoredChoice } from "@/lib/use-stored-choice";

const MODES = ["french", "interlinear", "side-by-side"] as const;
type Mode = (typeof MODES)[number];
const MODE_LABELS: Record<Mode, string> = {
  french: "French",
  interlinear: "Interlinear",
  "side-by-side": "Side by side",
};

/** Text selected within one sentence, with where to show the analyse button (relative to the view). */
interface TextSelection {
  sentence: number;
  span: string;
  top: number;
  left: number;
}

interface Analysis {
  /** Increments per request, so a late response for an older selection is dropped. */
  request: number;
  sentence: number;
  span: string;
  result: GrammarAnalysis | null;
  error: string | null;
}

/** The sentence number of the [data-sentence] element containing node, if any. */
function sentenceOf(node: Node | null): number | null {
  const el = node instanceof Element ? node : node?.parentElement;
  const sentence = el?.closest<HTMLElement>("[data-sentence]")?.dataset.sentence;
  return sentence === undefined ? null : Number(sentence);
}

/**
 * The extraction's text, optionally with its sentence-by-sentence translation. Selecting words
 * within one sentence (French and side-by-side modes) offers a grammar analysis.
 */
export function ReadView({
  extractionId,
  paragraphs,
  translations,
}: {
  extractionId: string;
  paragraphs: string[][];
  translations: string[] | null;
}) {
  const [mode, setMode] = useStoredChoice<Mode>("read-mode", MODES, "french");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  // Sentence numbers count across paragraphs, matching the translations array.
  const numbered = paragraphs.reduce<{ n: number; text: string }[][]>((acc, p) => {
    const start = acc.flat().length;
    acc.push(p.map((text, i) => ({ n: start + i, text })));
    return acc;
  }, []);
  const effectiveMode = translations ? mode : "french";

  useEffect(() => {
    function onSelectionChange() {
      const sel = document.getSelection();
      const view = viewRef.current;
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !view) return setSelection(null);
      const sentence = sentenceOf(sel.anchorNode);
      const span = sel.toString().trim();
      if (
        sentence === null ||
        sentence !== sentenceOf(sel.focusNode) ||
        !view.contains(sel.anchorNode) ||
        !span
      ) {
        return setSelection(null);
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const box = view.getBoundingClientRect();
      setSelection({
        sentence,
        span,
        top: rect.bottom - box.top + 6,
        left: rect.left - box.left + rect.width / 2,
      });
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  function toggle(n: number) {
    // A click that ends a text selection selects; it does not reveal the translation.
    if (!document.getSelection()?.isCollapsed) return;
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  async function analyze({ sentence, span }: TextSelection) {
    const request = ++requestRef.current;
    setAnalysis({ request, sentence, span, result: null, error: null });
    document.getSelection()?.removeAllRanges();
    try {
      const result = await analyzeGrammar(extractionId, sentence, span);
      setAnalysis((prev) => (prev?.request === request ? { ...prev, result } : prev));
    } catch (e) {
      const error = e instanceof Error ? e.message : "Analysis failed";
      setAnalysis((prev) => (prev?.request === request ? { ...prev, error } : prev));
    }
  }

  const hint = [
    !translations
      ? "Translate the text to see English sentences."
      : effectiveMode === "french"
        ? "Click a sentence to see its translation."
        : "",
    effectiveMode !== "interlinear" ? "Select words to analyse their grammar." : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={viewRef} className="relative flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{hint}</p>
        <div className="inline-flex rounded-lg border p-0.5">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={!translations && m !== "french"}
              className={cn(
                "rounded-md px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
                effectiveMode === m && "bg-muted font-medium text-foreground"
              )}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {effectiveMode === "french" && (
        <div className="flex max-w-3xl flex-col gap-4 leading-relaxed">
          {numbered.map((p, i) => (
            <p key={i}>
              {p.map(({ n, text }) => (
                <Fragment key={n}>
                  <span
                    data-sentence={n}
                    onClick={translations ? () => toggle(n) : undefined}
                    className={cn(
                      translations && "cursor-pointer rounded hover:bg-muted",
                      revealed.has(n) && "bg-muted"
                    )}
                  >
                    {text}
                  </span>{" "}
                  {translations && revealed.has(n) && (
                    <span className="my-1 block border-l-2 pl-3 text-sm text-muted-foreground">
                      {translations[n]}
                    </span>
                  )}
                </Fragment>
              ))}
            </p>
          ))}
        </div>
      )}

      {effectiveMode === "interlinear" && translations && (
        <div className="flex max-w-3xl flex-col gap-6 leading-relaxed">
          {numbered.map((p, i) => (
            <div key={i} className="flex flex-col gap-3">
              {p.map(({ n, text }) => (
                <div key={n}>
                  <p>{text}</p>
                  <p className="text-sm text-muted-foreground">{translations[n]}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {effectiveMode === "side-by-side" && translations && (
        <div className="flex flex-col gap-6 leading-relaxed">
          {numbered.map((p, i) => (
            <div key={i} className="flex flex-col">
              {p.map(({ n, text }) => (
                <div
                  key={n}
                  className="grid grid-cols-1 gap-x-8 rounded px-2 py-1.5 hover:bg-muted md:grid-cols-2"
                >
                  <p data-sentence={n}>{text}</p>
                  <p className="text-muted-foreground">{translations[n]}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {selection && effectiveMode !== "interlinear" && (
        <Button
          size="sm"
          className="absolute z-10 -translate-x-1/2 shadow-md"
          style={{ top: selection.top, left: selection.left }}
          // Keep the text selected while pressing the button.
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => analyze(selection)}
        >
          Analyse grammar
        </Button>
      )}

      {analysis && (
        <GrammarPanel
          key={analysis.request}
          extractionId={extractionId}
          sentence={analysis.sentence}
          span={analysis.span}
          analysis={analysis.result}
          error={analysis.error}
          onClose={() => setAnalysis(null)}
        />
      )}
    </div>
  );
}
