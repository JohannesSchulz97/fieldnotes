import "server-only";
import { asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  GrammarAnalysis,
  GrammarItem,
  GrammarStatus,
  LanguageCode,
} from "../types";
import { db } from ".";
import { grammarExamples, grammarItems } from "./schema";

/** All saved items, newest first, optionally filtered by status. */
export async function listGrammarItems(status?: GrammarStatus): Promise<GrammarItem[]> {
  const items = await db
    .select({
      id: grammarItems.id,
      language: grammarItems.language,
      name: grammarItems.name,
      explanation: grammarItems.explanation,
      status: grammarItems.status,
      createdAt: grammarItems.createdAt,
      updatedAt: grammarItems.updatedAt,
    })
    .from(grammarItems)
    .where(status ? eq(grammarItems.status, status) : undefined)
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
      note: grammarExamples.note,
      extractionId: grammarExamples.extractionId,
    })
    .from(grammarExamples)
    .where(inArray(grammarExamples.grammarItemId, items.map((i) => i.id)))
    // "source" sorts after "generated", so descending puts source examples first; examples saved
    // together share a timestamp, so rowid keeps the order they were inserted in.
    .orderBy(desc(grammarExamples.origin), sql`rowid`);
  const byItem = Map.groupBy(examples, (e) => e.grammarItemId);
  return items.map((item) => ({ ...item, examples: byItem.get(item.id) ?? [] }));
}

export async function countByStatus(): Promise<Record<GrammarStatus, number>> {
  const rows = await db
    .select({ status: grammarItems.status, n: count() })
    .from(grammarItems)
    .groupBy(grammarItems.status);
  const counts: Record<GrammarStatus, number> = { to_work_on: 0, learned: 0 };
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}

/** Names of saved items, so the LLM can reuse one when it sees the same construct again. */
export async function listGrammarNames(language: LanguageCode): Promise<string[]> {
  const rows = await db
    .select({ name: grammarItems.name })
    .from(grammarItems)
    .where(eq(grammarItems.language, language))
    .orderBy(asc(grammarItems.name));
  return rows.map((r) => r.name);
}

export interface SourceExample {
  sentence: string;
  form: string;
  translation: string | null;
  extractionId: string;
}

/**
 * Saves an analysis. An item with the same (language, name) keeps its explanation, goes back to
 * "to work on" and gains the new examples; examples it already has are skipped.
 */
export async function saveGrammarItem(
  language: LanguageCode,
  explanationLanguage: LanguageCode,
  analysis: GrammarAnalysis,
  source: SourceExample
): Promise<string> {
  const now = new Date().toISOString();
  const [{ id }] = await db
    .insert(grammarItems)
    .values({
      id: crypto.randomUUID(),
      language,
      name: analysis.name.trim(),
      explanation: analysis.explanation,
      explanationLanguage,
      status: "to_work_on",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [grammarItems.language, grammarItems.name],
      set: { status: "to_work_on", updatedAt: now },
    })
    .returning({ id: grammarItems.id });

  await db
    .insert(grammarExamples)
    .values([
      { ...source, origin: "source" as const, note: analysis.note },
      ...analysis.examples.map((e) => ({
        ...e,
        origin: "generated" as const,
        note: null,
        extractionId: null,
      })),
    ].map((e) => ({ ...e, id: crypto.randomUUID(), grammarItemId: id, createdAt: now })))
    .onConflictDoNothing();
  return id;
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
