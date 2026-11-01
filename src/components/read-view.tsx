"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { GlossedText, type GlossHover } from "@/components/glossed-text";
import type { Gloss } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { useStoredChoice } from "@/lib/use-stored-choice";

const MODES = ["original", "interlinear", "side-by-side"] as const;
type Mode = (typeof MODES)[number];
const MODE_LABELS: Record<Mode, string> = {
  original: "Original",
  interlinear: "Interlinear",
  "side-by-side": "Side by side",
};

/** How long a sentence opened via link stays highlighted. */
const FOCUS_HIGHLIGHT_MS = 2500;

/**
 * The extraction's text, optionally with its sentence-by-sentence translation. Sentences carry
 * data-sentence for grammar selection (turned off in interlinear mode via data-grammar-off).
 * New words are shown in bold wherever their form occurs.
 */
export function ReadView({
  paragraphs,
  translations,
  glosses,
  newForms,
  focusSentence,
  active,
}: {
  paragraphs: string[][];
  translations: string[] | null;
  /** Word glosses per sentence (same numbering), shown on hover in the original view. */
  glosses: Gloss[][] | null;
  /** How the extraction's new words appear in the text (ExtractedItem.form). */
  newForms: string[];
  /** Sentence to scroll to and highlight once the view is visible, e.g. from a grammar example link. */
  focusSentence: number | null;
  active: boolean;
}) {
  const [mode, setMode] = useStoredChoice<Mode>("read-mode", MODES, "original");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [hover, setHover] = useState<GlossHover | null>(null);
  const tooltipId = useId();
  const viewRef = useRef<HTMLDivElement>(null);
  // The sentence last scrolled to, so it happens once per link, not on every mode change.
  const focusedRef = useRef<number | null>(null);

  // Sentence numbers count across paragraphs, matching the translations array.
  const numbered = paragraphs.reduce<{ n: number; text: string }[][]>((acc, p) => {
    const start = acc.flat().length;
    acc.push(p.map((text, i) => ({ n: start + i, text })));
    return acc;
  }, []);
  const effectiveMode = translations ? mode : "original";

  useEffect(() => {
    if (focusSentence === null || !active || focusedRef.current === focusSentence) return;
    const el = viewRef.current?.querySelector(`[data-sentence="${focusSentence}"]`);
    if (!el) return;
    focusedRef.current = focusSentence;
    el.scrollIntoView({ block: "center" });
    setHighlighted(focusSentence);
    const timer = setTimeout(() => setHighlighted(null), FOCUS_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [focusSentence, active, effectiveMode]);

  // The peek gives way to anything else: pressing the mouse (a selection may start), a selection,
  // or scrolling the group away from under the tooltip.
  useEffect(() => {
    const clear = () => setHover(null);
    const onSelectionChange = () => {
      if (!document.getSelection()?.isCollapsed) clear();
    };
    document.addEventListener("pointerdown", clear);
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("scroll", clear, true);
    return () => {
      document.removeEventListener("pointerdown", clear);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("scroll", clear, true);
    };
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

  const focusClass = (n: number) =>
    cn("transition-colors duration-700", highlighted === n && "bg-yellow-200/70 dark:bg-yellow-500/30");

  const marked = (text: string, n?: number) => (
    <GlossedText
      id={n === undefined ? undefined : String(n)}
      text={text}
      forms={newForms}
      glosses={n === undefined ? undefined : glosses?.[n]}
      hover={hover}
      tooltipId={tooltipId}
      onHover={setHover}
    />
  );
  const hasGlosses = effectiveMode === "original" && !!glosses?.some((g) => g.length > 0);

  const hint = [
    newForms.length > 0 ? "New words are in bold." : "",
    !translations
      ? "Translate the text to see translated sentences."
      : effectiveMode === "original"
        ? `${hasGlosses ? "Hover a word for its meaning. " : ""}Click a sentence to see its translation.`
        : "",
    effectiveMode !== "interlinear" ? "Select words to analyse their grammar." : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={viewRef} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{hint}</p>
        <div className="inline-flex rounded-lg border p-0.5">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={!translations && m !== "original"}
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

      {effectiveMode === "original" && (
        <div className="flex max-w-3xl flex-col gap-4 leading-relaxed">
          {numbered.map((p, i) => (
            <p key={i}>
              {p.map(({ n, text }) => (
                <Fragment key={n}>
                  <span
                    data-sentence={n}
                    onClick={translations ? () => toggle(n) : undefined}
                    className={cn(
                      translations && "cursor-pointer rounded",
                      // With word glosses the hovered word is the highlight; without, the sentence.
                      translations && !glosses?.[n]?.length && "hover:bg-muted",
                      revealed.has(n) && "bg-muted",
                      focusClass(n)
                    )}
                  >
                    {marked(text, n)}
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
        <div data-grammar-off className="flex max-w-3xl flex-col gap-6 leading-relaxed">
          {numbered.map((p, i) => (
            <div key={i} className="flex flex-col gap-3">
              {p.map(({ n, text }) => (
                <div key={n}>
                  <p data-sentence={n} className={focusClass(n)}>
                    {marked(text)}
                  </p>
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
                  className={cn(
                    "grid grid-cols-1 gap-x-8 rounded px-2 py-1.5 hover:bg-muted md:grid-cols-2",
                    focusClass(n)
                  )}
                >
                  <p data-sentence={n}>{marked(text)}</p>
                  <p className="text-muted-foreground">{translations[n]}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {hover && (
        <div
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none fixed z-20 max-w-xs -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1 text-sm text-popover-foreground shadow-md"
          style={{ top: hover.rect.top - 6, left: hover.rect.left + hover.rect.width / 2 }}
        >
          {hover.gloss}
        </div>
      )}
    </div>
  );
}
