"use client";

import Link from "next/link";
import { useState } from "react";
import { splitWords } from "@/lib/exercises";
import type { ExerciseWord, WordStudyStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface WordStudy {
  status: (word: ExerciseWord) => WordStudyStatus;
  /** Puts the word on the study list. */
  study: (word: ExerciseWord) => Promise<void>;
  /** Link to the exercises source, once it exists. */
  sourceHref: string | null;
}

/**
 * A word with a popup (on hover, or on tap/focus) showing its lemma and translation, and a
 * button to study it. Words outside the vocabulary are underlined.
 */
export function ExerciseWordSpan({
  text,
  word,
  study,
}: {
  text: string;
  word: ExerciseWord;
  study: WordStudy;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = study.status(word);

  async function handleStudy() {
    setPending(true);
    setError(null);
    try {
      await study.study(word);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the word");
    } finally {
      setPending(false);
    }
  }

  return (
    <span tabIndex={0} className="group relative cursor-help outline-none">
      <span
        className={cn(
          "rounded-sm group-hover:bg-muted group-focus-within:bg-muted",
          status !== "known" && "underline decoration-dotted underline-offset-4",
          status === "studying" && "decoration-primary"
        )}
      >
        {text}
      </span>
      {/* pt-1 bridges the gap, so the pointer can move into the popup without closing it. */}
      <span className="invisible absolute top-full left-0 z-10 pt-1 opacity-0 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <span className="flex w-max max-w-72 flex-col items-start gap-1.5 rounded-lg border bg-popover p-2.5 text-sm leading-snug font-normal text-popover-foreground not-italic shadow-md">
          <span>
            <span className="font-medium">{word.lemma}</span>{" "}
            <span className="text-muted-foreground">{word.translation}</span>
          </span>
          {status === "studying" ? (
            <span className="text-xs text-muted-foreground">
              On your study list
              {study.sourceHref && (
                <>
                  {" · "}
                  <Link href={study.sourceHref} className="underline underline-offset-2 hover:text-foreground">
                    Exercises source
                  </Link>
                </>
              )}
            </span>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={handleStudy}
              className="text-xs font-medium underline underline-offset-2 hover:text-muted-foreground disabled:opacity-50"
            >
              {pending ? "Adding…" : status === "known" ? "I don't know this" : "Study this word"}
            </button>
          )}
          {error && <span className="text-xs text-destructive">{error}</span>}
        </span>
      </span>
    </span>
  );
}

/** Text with the exercise's words made hoverable. */
export function WordText({
  text,
  words,
  study,
}: {
  text: string;
  words: ExerciseWord[];
  study: WordStudy;
}) {
  return splitWords(text, words).map((part, i) =>
    part.word ? (
      <ExerciseWordSpan key={i} text={part.text} word={part.word} study={study} />
    ) : (
      <span key={i}>{part.text}</span>
    )
  );
}
