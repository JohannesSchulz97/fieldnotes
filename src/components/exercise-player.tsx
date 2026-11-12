"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreateExercises } from "@/components/create-exercises";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type WordStudy, WordText } from "@/components/exercise-words";
import {
  deleteExerciseSet,
  setGrammarStatus,
  studyExerciseWord,
  submitExerciseAnswer,
} from "@/app/actions";
import { type Grade, LEARNED_SUGGESTION_SCORE } from "@/lib/exercises";
import { grammarItemHref } from "@/lib/grammar";
import { vocabKey } from "@/lib/lemma";
import type { Exercise, ExerciseSet, ExerciseWord, WordStudyStatus } from "@/lib/types";

interface Result {
  answer: string;
  grade: Grade;
}

/** The sentence with the expected answer in bold. */
function Solution({ exercise, study }: { exercise: Exercise; study: WordStudy }) {
  return (
    <span>
      <WordText text={exercise.before} words={exercise.words} study={study} />
      <strong className="font-semibold">
        <WordText text={exercise.answer} words={exercise.words} study={study} />
      </strong>
      <WordText text={exercise.after} words={exercise.words} study={study} />
    </span>
  );
}

const GRADE_LABEL: Record<Grade, string> = {
  correct: "Correct",
  accents: "Almost: check the accents",
  wrong: "Not quite",
};

/**
 * Runs through a set one exercise at a time: type the answer, check it, see the solution.
 * Starts at the first unanswered exercise; a finished set shows its summary.
 */
export function ExercisePlayer({ set }: { set: ExerciseSet }) {
  const router = useRouter();
  const { exercises } = set;
  const [results, setResults] = useState<Record<string, Result>>(() =>
    Object.fromEntries(
      exercises
        .filter((e) => e.lastAttempt)
        .map((e) => [
          e.id,
          { answer: e.lastAttempt!.answer, grade: e.lastAttempt!.correct ? "correct" : "wrong" },
        ])
    )
  );
  const [index, setIndex] = useState(() => {
    const first = exercises.findIndex((e) => !e.lastAttempt);
    return first === -1 ? exercises.length : first;
  });
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemStatus, setItemStatus] = useState(set.item.status);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [wordStatus, setWordStatus] = useState(set.wordStatus);
  const [sourceId, setSourceId] = useState(set.exercisesSourceId);

  const exercise = exercises[index] as Exercise | undefined;
  const result = exercise ? results[exercise.id] : undefined;

  /** Word lookups and the study action for the words of one exercise. */
  function studyFor(e: Exercise): WordStudy {
    return {
      status: (word) => wordStatus[vocabKey(word)] ?? ("unknown" satisfies WordStudyStatus),
      study: async (word: ExerciseWord) => {
        setSourceId(await studyExerciseWord(e.id, vocabKey(word)));
        setWordStatus((s) => ({ ...s, [vocabKey(word)]: "studying" }));
      },
      sourceHref: sourceId ? `/extractions/${sourceId}` : null,
    };
  }

  async function check() {
    if (!exercise || !input.trim()) return;
    setPending(true);
    setError(null);
    try {
      const grade = await submitExerciseAnswer(exercise.id, input);
      setResults((r) => ({ ...r, [exercise.id]: { answer: input.trim(), grade } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check the answer");
    } finally {
      setPending(false);
    }
  }

  function next() {
    setInput("");
    setIndex((i) => i + 1);
  }

  function restart() {
    setResults({});
    setInput("");
    setIndex(0);
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  if (!exercise) {
    const correct = exercises.filter((e) => results[e.id]?.grade === "correct").length;
    const suggestLearned =
      itemStatus === "to_work_on" && correct / exercises.length >= LEARNED_SUGGESTION_SCORE;
    return (
      <section className="flex flex-col gap-5">
        <p className="text-lg font-semibold">
          {correct} / {exercises.length} correct
        </p>
        {suggestLearned && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
            <span>Strong result. Mark this construct as learned?</span>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await setGrammarStatus(set.item.id, "learned");
                  setItemStatus("learned");
                })
              }
            >
              Mark learned
            </Button>
          </div>
        )}
        <ol className="flex flex-col gap-3 text-sm">
          {exercises.map((e) => {
            const r = results[e.id];
            return (
              <li key={e.id} className="flex gap-2">
                {r?.grade === "correct" ? (
                  <Check className="mt-0.5 size-4 shrink-0" aria-label="Correct" />
                ) : (
                  <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Wrong" />
                )}
                <div className="flex flex-col">
                  <Solution exercise={e} study={studyFor(e)} />
                  {r && r.grade !== "correct" && (
                    <span className="text-xs text-muted-foreground">Your answer: {r.answer}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={restart}>
            Practise again
          </Button>
          <CreateExercises grammarItemId={set.item.id} label="New set" initialCount={exercises.length} />
          {confirmDelete ? (
            <>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    await deleteExerciseSet(set.id);
                    router.push("/exercises");
                  })
                }
              >
                Delete this set
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
              Delete set
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {index + 1} / {exercises.length}
        </span>
        <Link
          href={grammarItemHref(exercise.grammar.id)}
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Theory: {exercise.grammar.name}
        </Link>
      </div>
      {result ? (
        <div className="flex flex-col gap-3">
          <p className={result.grade === "correct" ? "font-medium" : "font-medium text-destructive"}>
            {GRADE_LABEL[result.grade]}
            {result.grade !== "correct" && (
              <span className="font-normal text-muted-foreground"> · you wrote “{result.answer}”</span>
            )}
          </p>
          <p className="text-lg">
            <Solution exercise={exercise} study={studyFor(exercise)} />
          </p>
          {exercise.alternatives.length > 0 && (
            <p className="text-sm text-muted-foreground">Also correct: {exercise.alternatives.join(", ")}</p>
          )}
          <p className="text-sm text-muted-foreground">{exercise.translation}</p>
          <p className="text-sm">{exercise.reason}</p>
          <Button autoFocus className="self-start" onClick={next}>
            {index + 1 < exercises.length ? "Next" : "See results"}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            check();
          }}
        >
          <p className="text-lg leading-loose">
            <WordText text={exercise.before} words={exercise.words} study={studyFor(exercise)} />
            <Input
              key={exercise.id}
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={pending}
              aria-label="Answer"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="mx-1 inline-flex h-8 align-baseline text-lg md:text-lg"
              style={{ width: `${Math.max(8, input.length + 2)}ch` }}
            />
            {/* Not hoverable: the answer word's translation would give the answer away. */}
            <span className="text-muted-foreground">({exercise.cue})</span>
            <WordText text={exercise.after} words={exercise.words} study={studyFor(exercise)} />
          </p>
          {exercise.words.length > 0 && (
            <p className="text-xs text-muted-foreground">Hover or tap a word for its translation.</p>
          )}
          <Button type="submit" className="self-start" disabled={pending || !input.trim()}>
            {pending ? "Checking…" : "Check"}
          </Button>
        </form>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
