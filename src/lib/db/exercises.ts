import "server-only";
import { asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import type {
  CefrLevel,
  Exercise,
  ExerciseSet,
  ExerciseSetSummary,
  LanguageCode,
  UnknownWord,
} from "../types";
import { db } from ".";
import { exerciseAttempts, exercises, exerciseSets, grammarItems } from "./schema";

export interface ExerciseRecord {
  before: string;
  answer: string;
  after: string;
  alternatives: string[];
  cue: string;
  translation: string;
  reason: string;
  unknownWords: UnknownWord[];
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
  const sets = await db
    .select({
      id: exerciseSets.id,
      grammarItemId: exerciseSets.grammarItemId,
      grammarItemName: grammarItems.name,
      level: exerciseSets.level,
      createdAt: exerciseSets.createdAt,
    })
    .from(exerciseSets)
    .innerJoin(grammarItems, eq(grammarItems.id, exerciseSets.grammarItemId))
    .where(eq(exerciseSets.language, language))
    .orderBy(desc(exerciseSets.createdAt));
  if (sets.length === 0) return [];
  const rows = await db
    .select({ id: exercises.id, setId: exercises.setId })
    .from(exercises)
    .where(inArray(exercises.setId, sets.map((s) => s.id)));
  const attempts = await latestAttempts(rows.map((r) => r.id));
  const bySet = Map.groupBy(rows, (r) => r.setId);
  return sets.map((s) => {
    const ids = (bySet.get(s.id) ?? []).map((r) => r.id);
    const answered = ids.map((id) => attempts.get(id)).filter((a) => a !== undefined);
    return {
      ...s,
      total: ids.length,
      answered: answered.length,
      correct: answered.filter((a) => a.correct).length,
    };
  });
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
  const attempts = await latestAttempts(rows.map((r) => r.id));
  return {
    ...set,
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
        unknownWords: r.unknownWords,
        lastAttempt: attempts.get(r.id) ?? null,
      })
    ),
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
