"use client";

import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import { useStoredChoice } from "@/lib/use-stored-choice";

const MODES = ["french", "interlinear", "side-by-side"] as const;
type Mode = (typeof MODES)[number];
const MODE_LABELS: Record<Mode, string> = {
  french: "French",
  interlinear: "Interlinear",
  "side-by-side": "Side by side",
};

/** The extraction's text, optionally with its sentence-by-sentence translation. */
export function ReadView({
  paragraphs,
  translations,
}: {
  paragraphs: string[][];
  translations: string[] | null;
}) {
  const [mode, setMode] = useStoredChoice<Mode>("read-mode", MODES, "french");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  // Sentence numbers count across paragraphs, matching the translations array.
  const numbered = paragraphs.reduce<{ n: number; text: string }[][]>((acc, p) => {
    const start = acc.flat().length;
    acc.push(p.map((text, i) => ({ n: start + i, text })));
    return acc;
  }, []);
  const effectiveMode = translations ? mode : "french";

  function toggle(n: number) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {!translations
            ? "Translate the text to see English sentences."
            : effectiveMode === "french"
              ? "Click a sentence to see its translation."
              : ""}
        </p>
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
                  <p>{text}</p>
                  <p className="text-muted-foreground">{translations[n]}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
