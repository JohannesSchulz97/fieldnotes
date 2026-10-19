import "server-only";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { normalizeGrammarName } from "../grammar";
import type {
  CefrLevel,
  GrammarCategory,
  GrammarExampleOrigin,
  GrammarItem,
  GrammarStatus,
  LanguageCode,
} from "../types";
import { db } from ".";
import { grammarExamples, grammarItems } from "./schema";

/** Saved items with their examples, newest first, filtered by any of the given fields. */
export async function listGrammarItems({
  language,
  status,
  category,
  ids,
}: {
  language?: LanguageCode;
  status?: GrammarStatus;
  category?: GrammarCategory;
  ids?: string[];
} = {}): Promise<GrammarItem[]> {
  if (ids?.length === 0) return [];
  const items = await db
    .select({
      id: grammarItems.id,
      language: grammarItems.language,
      name: grammarItems.name,
      category: grammarItems.category,
      level: grammarItems.level,
      explanation: grammarItems.explanation,
      status: grammarItems.status,
      createdAt: grammarItems.createdAt,
      updatedAt: grammarItems.updatedAt,
    })
    .from(grammarItems)
    .where(
      and(
        language ? eq(grammarItems.language, language) : undefined,
        status ? eq(grammarItems.status, status) : undefined,
        category ? eq(grammarItems.category, category) : undefined,
        ids ? inArray(grammarItems.id, ids) : undefined
      )
    )
    .orderBy(desc(grammarItems.createdAt));
  if (items.length === 0) return [];
  const examples = await db
    .select({
      id: grammarExamples.id,
      grammarItemId: grammarExamples.grammarItemId,
      origin: grammarExamples.origin,
      sentence: grammarExamples.sentence,
      form: grammarExamples.form,
      translation: grammarExamples.translation,
      extractionId: grammarExamples.extractionId,
      sentenceIndex: grammarExamples.sentenceIndex,
    })
    .from(grammarExamples)
    .where(inArray(grammarExamples.grammarItemId, items.map((i) => i.id)))
    // "source" sorts after "generated", so descending puts source examples first; examples saved
    // together share a timestamp, so rowid keeps the order they were inserted in.
    .orderBy(desc(grammarExamples.origin), sql`rowid`);
  const byItem = Map.groupBy(examples, (e) => e.grammarItemId);
  return items.map((item) => ({ ...item, examples: byItem.get(item.id) ?? [] }));
}

export async function countByStatus(language: LanguageCode): Promise<Record<GrammarStatus, number>> {
  const rows = await db
    .select({ status: grammarItems.status, n: count() })
    .from(grammarItems)
    .where(eq(grammarItems.language, language))
    .groupBy(grammarItems.status);
  const counts: Record<GrammarStatus, number> = { to_work_on: 0, learned: 0 };
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}

/** Number of items per category; categories without items are missing. */
export async function countByCategory(language: LanguageCode): Promise<Map<GrammarCategory, number>> {
  const rows = await db
    .select({ category: grammarItems.category, n: count() })
    .from(grammarItems)
    .where(eq(grammarItems.language, language))
    .groupBy(grammarItems.category);
  return new Map(rows.map((r) => [r.category, r.n]));
}

/** Id and name of every saved item in a language, for matching new constructs against. */
export async function listGrammarNames(
  language: LanguageCode
): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: grammarItems.id, name: grammarItems.name })
    .from(grammarItems)
    .where(eq(grammarItems.language, language))
    .orderBy(asc(grammarItems.name));
}

export async function getGrammarItemLanguage(id: string): Promise<LanguageCode | null> {
  const [row] = await db
    .select({ language: grammarItems.language })
    .from(grammarItems)
    .where(eq(grammarItems.id, id));
  return row?.language ?? null;
}

export interface ExampleRecord {
  origin: GrammarExampleOrigin;
  sentence: string;
  form: string;
  translation: string | null;
  extractionId: string | null;
  sentenceIndex: number | null;
}

/**
 * Saves a new item with its examples. If an item with the same (language, name) exists, it keeps
 * its data and only gains the examples.
 */
export async function createGrammarItem(
  language: LanguageCode,
  explanationLanguage: LanguageCode,
  item: { name: string; category: GrammarCategory; level: CefrLevel; explanation: string },
  examples: ExampleRecord[]
): Promise<string> {
  const now = new Date().toISOString();
  const [{ id }] = await db
    .insert(grammarItems)
    .values({
      id: crypto.randomUUID(),
      language,
      ...item,
      name: normalizeGrammarName(item.name),
      explanationLanguage,
      status: "to_work_on",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [grammarItems.language, grammarItems.name],
      set: { updatedAt: now },
    })
    .returning({ id: grammarItems.id });
  await addGrammarExamples(id, examples);
  return id;
}

/** Adds examples to an item (skipping sentences it already has) and puts it back to "to work on". */
export async function addGrammarExamples(id: string, examples: ExampleRecord[]): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    db
      .insert(grammarExamples)
      .values(
        examples.map((e) => ({ ...e, id: crypto.randomUUID(), grammarItemId: id, createdAt: now }))
      )
      .onConflictDoNothing(),
    db
      .update(grammarItems)
      .set({ status: "to_work_on", updatedAt: now })
      .where(eq(grammarItems.id, id)),
  ]);
}

export async function setGrammarStatus(id: string, status: GrammarStatus): Promise<void> {
  await db
    .update(grammarItems)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(grammarItems.id, id));
}

/** Deletes an item and its examples (explicitly, as SQLite may not enforce the cascade). */
export async function deleteGrammarItem(id: string): Promise<void> {
  await db.batch([
    db.delete(grammarExamples).where(eq(grammarExamples.grammarItemId, id)),
    db.delete(grammarItems).where(eq(grammarItems.id, id)),
  ]);
}
