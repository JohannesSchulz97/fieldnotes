import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { normalizeGrammarName } from "../grammar";
import { cardExplanation, getConstruct } from "../grammar-catalog";
import type {
  CefrLevel,
  GrammarCategory,
  GrammarExampleOrigin,
  GrammarItem,
  GrammarStatus,
  LanguageCode,
} from "../types";
import { db } from ".";
import { deleteExerciseSetsStatements } from "./exercises";
import { exerciseSets, grammarExamples, grammarItems } from "./schema";

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
      constructId: grammarItems.constructId,
      name: grammarItems.name,
      category: grammarItems.category,
      level: grammarItems.level,
      explanation: grammarItems.explanation,
      explanationLanguage: grammarItems.explanationLanguage,
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
  return items.map(({ explanationLanguage, ...item }) => ({
    ...item,
    ...fromCatalog(item.language, item.constructId, explanationLanguage),
    examples: byItem.get(item.id) ?? [],
  }));
}

/**
 * The catalogue's current data for a saved catalogue construct, so catalogue fixes show on items
 * saved earlier. Empty for freely named items.
 */
function fromCatalog(
  language: LanguageCode,
  constructId: string | null,
  explanationLanguage: LanguageCode
): Partial<GrammarItem> & Pick<GrammarItem, "pitfalls" | "contrasts"> {
  const construct = constructId ? getConstruct(language, constructId) : null;
  if (!construct) return { pitfalls: [], contrasts: [] };
  const explanation = cardExplanation(language, construct, explanationLanguage);
  return {
    name: construct.name,
    category: construct.category,
    level: construct.level,
    ...(explanation && { explanation }),
    pitfalls: explanation ? construct.card!.pitfalls : [],
    contrasts: explanation
      ? construct.card!.contrasts.flatMap((c) => {
          const other = getConstruct(language, c.id);
          return other ? [{ name: other.name, note: c.note }] : [];
        })
      : [],
  };
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

/** Id, catalogue construct and name of every saved item in a language, for matching new constructs against. */
export async function listGrammarNames(
  language: LanguageCode
): Promise<{ id: string; constructId: string | null; name: string }[]> {
  const rows = await db
    .select({ id: grammarItems.id, constructId: grammarItems.constructId, name: grammarItems.name })
    .from(grammarItems)
    .where(eq(grammarItems.language, language));
  return rows
    .map((r) => ({
      ...r,
      name: (r.constructId && getConstruct(language, r.constructId)?.name) || r.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, language));
}

async function findByConstruct(language: LanguageCode, constructId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: grammarItems.id })
    .from(grammarItems)
    .where(and(eq(grammarItems.language, language), eq(grammarItems.constructId, constructId)));
  return row?.id ?? null;
}

/**
 * Links a saved item to a catalogue construct and takes over its name, category and level. If
 * another item already has that construct, the item's examples move there and the item is
 * deleted. Returns the id of the item that now holds the construct.
 */
export async function assignConstruct(
  id: string,
  construct: { id: string; name: string; category: GrammarCategory; level: CefrLevel }
): Promise<string> {
  const [item] = await db
    .select({ language: grammarItems.language })
    .from(grammarItems)
    .where(eq(grammarItems.id, id));
  if (!item) throw new Error(`Grammar item ${id} not found`);
  const now = new Date().toISOString();
  const [target] = await db
    .select({ id: grammarItems.id })
    .from(grammarItems)
    .where(
      and(
        eq(grammarItems.language, item.language),
        sql`${grammarItems.id} <> ${id}`,
        sql`(${grammarItems.constructId} = ${construct.id} or ${grammarItems.name} = ${construct.name})`
      )
    );
  if (target) {
    const examples = await db.select().from(grammarExamples).where(eq(grammarExamples.grammarItemId, id));
    await addGrammarExamples(
      target.id,
      examples.map((e) => ({
        origin: e.origin,
        sentence: e.sentence,
        form: e.form,
        translation: e.translation,
        extractionId: e.extractionId,
        sentenceIndex: e.sentenceIndex,
      }))
    );
    await db.update(exerciseSets).set({ grammarItemId: target.id }).where(eq(exerciseSets.grammarItemId, id));
    await deleteGrammarItem(id);
    id = target.id;
  }
  await db
    .update(grammarItems)
    .set({
      constructId: construct.id,
      name: construct.name,
      category: construct.category,
      level: construct.level,
      updatedAt: now,
    })
    .where(eq(grammarItems.id, id));
  return id;
}

/** Saved items of a language not linked to a catalogue construct. */
export async function listUnlinkedGrammarItems(language: LanguageCode): Promise<GrammarItem[]> {
  const items = await listGrammarItems({ language });
  return items.filter((i) => i.constructId === null);
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
 * Saves a new item with its examples. If an item of the same catalogue construct, or with the same
 * (language, name), exists, it keeps its data and only gains the examples.
 */
export async function createGrammarItem(
  language: LanguageCode,
  explanationLanguage: LanguageCode,
  item: {
    constructId: string | null;
    name: string;
    category: GrammarCategory;
    level: CefrLevel;
    explanation: string;
  },
  examples: ExampleRecord[]
): Promise<string> {
  const existing = item.constructId ? await findByConstruct(language, item.constructId) : null;
  if (existing) {
    await addGrammarExamples(existing, examples);
    return existing;
  }
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

/** Deletes an item with its examples and exercise sets (explicitly, as SQLite may not enforce the cascade). */
export async function deleteGrammarItem(id: string): Promise<void> {
  await db.batch([
    ...deleteExerciseSetsStatements(eq(exerciseSets.grammarItemId, id)),
    db.delete(grammarExamples).where(eq(grammarExamples.grammarItemId, id)),
    db.delete(grammarItems).where(eq(grammarItems.id, id)),
  ]);
}
