import "server-only";
import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type {
  CefrLevel,
  Exercise,
  ExerciseSet,
  ExerciseSetSummary,
  ExerciseWord,
  LanguageCode,
  WordStudyStatus,
} from "../types";
import { db } from ".";
import { getExercisesSource } from "./extractions";
import { exerciseAttempts, exercises, exerciseSets, grammarItems } from "./schema";
import { getStoredStatuses } from "./vocab";

export interface ExerciseRecord {
  before: string;
  answer: string;
  after: string;
  alternatives: string[];
  cue: string;
  translation: string;
  reason: string;
  words: ExerciseWord[];
}

/** Saves a generated set with its exercises in the given order. */
export async function createExerciseSet(
  set: { grammarItemId: string; language: LanguageCode; level: CefrLevel; costUsd: number | null },
  records: ExerciseRecord[]
): Promise<string> {
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(exerciseSets).values({ id, ...set, createdAt: new Date().toISOString() }),
    db.insert(exercises).values(
      records.map((r, position) => ({ ...r, id: crypto.randomUUID(), setId: id, position }))
    ),
  ]);
  return id;
}

/** The latest attempt per exercise, by exercise id. */
async function latestAttempts(
  exerciseIds: string[]
): Promise<Map<string, { answer: string; correct: boolean }>> {
  if (exerciseIds.length === 0) return new Map();
  const rows = await db
    .select({
      exerciseId: exerciseAttempts.exerciseId,
      answer: exerciseAttempts.answer,
      correct: exerciseAttempts.correct,
    })
    .from(exerciseAttempts)
    .where(inArray(exerciseAttempts.exerciseId, exerciseIds))
    .orderBy(asc(exerciseAttempts.createdAt));
  // Ascending order, so later attempts overwrite earlier ones.
  return new Map(rows.map((r) => [r.exerciseId, { answer: r.answer, correct: r.correct }]));
}

/** A language's sets, newest first, with their progress. */
export async function listExerciseSets(language: LanguageCode): Promise<ExerciseSetSummary[]> {
  // The latest attempt per exercise has rank 1; equal timestamps fall back to insertion order.
  const ranked = db.$with("ranked_attempts").as(
    db
      .select({
        exerciseId: exerciseAttempts.exerciseId,
        correct: exerciseAttempts.correct,
        rank: sql<number>`row_number() over (partition by ${exerciseAttempts.exerciseId} order by ${exerciseAttempts.createdAt} desc, rowid desc)`.as(
          "rank"
        ),
      })
      .from(exerciseAttempts)
  );
  return db
    .with(ranked)
    .select({
      id: exerciseSets.id,
      grammarItemId: exerciseSets.grammarItemId,
      grammarItemName: grammarItems.name,
      level: exerciseSets.level,
      total: count(exercises.id),
      answered: count(ranked.exerciseId),
      correct: sql<number>`coalesce(sum(${ranked.correct}), 0)`.mapWith(Number),
      createdAt: exerciseSets.createdAt,
    })
    .from(exerciseSets)
    .innerJoin(grammarItems, eq(grammarItems.id, exerciseSets.grammarItemId))
    .leftJoin(exercises, eq(exercises.setId, exerciseSets.id))
    .leftJoin(ranked, and(eq(ranked.exerciseId, exercises.id), eq(ranked.rank, 1)))
    .where(eq(exerciseSets.language, language))
    .groupBy(exerciseSets.id, grammarItems.name)
    .orderBy(desc(exerciseSets.createdAt));
}

/** A set with its exercises in order, each with its latest attempt. */
export async function getExerciseSet(id: string): Promise<ExerciseSet | null> {
  const [set] = await db
    .select({
      id: exerciseSets.id,
      language: exerciseSets.language,
      level: exerciseSets.level,
      createdAt: exerciseSets.createdAt,
      item: {
        id: grammarItems.id,
        name: grammarItems.name,
        explanation: grammarItems.explanation,
        status: grammarItems.status,
      },
    })
    .from(exerciseSets)
    .innerJoin(grammarItems, eq(grammarItems.id, exerciseSets.grammarItemId))
    .where(eq(exerciseSets.id, id));
  if (!set) return null;
  const rows = await db
    .select()
    .from(exercises)
    .where(eq(exercises.setId, id))
    .orderBy(asc(exercises.position));
  const lemmas = [...new Set(rows.flatMap((r) => r.words.map((w) => w.lemma)))];
  const [attempts, stored, source] = await Promise.all([
    latestAttempts(rows.map((r) => r.id)),
    getStoredStatuses(set.language, lemmas),
    getExercisesSource(set.language),
  ]);
  const statusOf = (lemma: string): WordStudyStatus =>
    stored.has(lemma) ? "known" : source?.lemmas.has(lemma) ? "studying" : "unknown";
  return {
    ...set,
    wordStatus: Object.fromEntries(lemmas.map((l) => [l, statusOf(l)])),
    exercisesSourceId: source?.id ?? null,
    exercises: rows.map(
      (r): Exercise => ({
        id: r.id,
        before: r.before,
        answer: r.answer,
        after: r.after,
        alternatives: r.alternatives,
        cue: r.cue,
        translation: r.translation,
        reason: r.reason,
        words: r.words,
        lastAttempt: attempts.get(r.id) ?? null,
      })
    ),
  };
}

/** An exercise's full sentence, translation and words, with its set's language. */
export async function getExerciseSentence(exerciseId: string): Promise<{
  language: LanguageCode;
  sentence: string;
  translation: string;
  words: ExerciseWord[];
} | null> {
  const [row] = await db
    .select({
      language: exerciseSets.language,
      before: exercises.before,
      answer: exercises.answer,
      after: exercises.after,
      translation: exercises.translation,
      words: exercises.words,
    })
    .from(exercises)
    .innerJoin(exerciseSets, eq(exerciseSets.id, exercises.setId))
    .where(eq(exercises.id, exerciseId));
  if (!row) return null;
  return {
    language: row.language,
    sentence: row.before + row.answer + row.after,
    translation: row.translation,
    words: row.words,
  };
}

/** The accepted answers of an exercise, for grading; null if it does not exist. */
export async function getExpectedAnswers(exerciseId: string): Promise<string[] | null> {
  const [row] = await db
    .select({ answer: exercises.answer, alternatives: exercises.alternatives })
    .from(exercises)
    .where(eq(exercises.id, exerciseId));
  return row ? [row.answer, ...row.alternatives] : null;
}

export async function recordAttempt(exerciseId: string, answer: string, correct: boolean): Promise<void> {
  await db.insert(exerciseAttempts).values({
    id: crypto.randomUUID(),
    exerciseId,
    answer,
    correct,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Statements that delete the sets matching `where`, with their exercises and attempts
 * (explicitly, as SQLite may not enforce the cascade). For use in a batch.
 */
export function deleteExerciseSetsStatements(where: SQL) {
  const setIds = db.select({ id: exerciseSets.id }).from(exerciseSets).where(where);
  const exerciseIds = db
    .select({ id: exercises.id })
    .from(exercises)
    .where(inArray(exercises.setId, setIds));
  return [
    db.delete(exerciseAttempts).where(inArray(exerciseAttempts.exerciseId, exerciseIds)),
    db.delete(exercises).where(inArray(exercises.setId, setIds)),
    db.delete(exerciseSets).where(where),
  ] as const;
}

export async function deleteExerciseSet(id: string): Promise<void> {
  await db.batch(deleteExerciseSetsStatements(eq(exerciseSets.id, id)));
}
