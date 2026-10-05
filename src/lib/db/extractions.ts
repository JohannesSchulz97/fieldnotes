import "server-only";
import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { LlmExtraction } from "../llm/extract";
import { splitParagraphs } from "../sentences";
import type { ExtractionResult, ExtractionSummary } from "../types";
import { db } from ".";
import { extractions } from "./schema";
import { getStoredStatuses } from "./vocab";

const PREVIEW_LENGTH = 80;

export function hashText(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

export async function findExtractionIdByHash(textHash: string): Promise<string | null> {
  const [row] = await db
    .select({ id: extractions.id })
    .from(extractions)
    .where(eq(extractions.textHash, textHash));
  return row?.id ?? null;
}

export async function getExtractionText(id: string): Promise<string | null> {
  const [row] = await db
    .select({ text: extractions.text })
    .from(extractions)
    .where(eq(extractions.id, id));
  return row?.text ?? null;
}

export async function insertExtraction(text: string, result: LlmExtraction): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(extractions).values({
    id,
    textHash: hashText(text),
    text,
    sourceLanguage: result.sourceLanguage,
    targetLanguage: result.targetLanguage,
    items: result.items,
    costUsd: result.costUsd,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function saveTranslations(id: string, translations: string[]): Promise<void> {
  await db
    .update(extractions)
    .set({ translations, updatedAt: new Date().toISOString() })
    .where(eq(extractions.id, id));
}

/** Replaces the stored items with a fresh LLM run. */
export async function updateExtraction(id: string, result: LlmExtraction): Promise<void> {
  await db
    .update(extractions)
    .set({
      sourceLanguage: result.sourceLanguage,
      targetLanguage: result.targetLanguage,
      items: result.items,
      costUsd: result.costUsd,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(extractions.id, id));
}

/** Loads an extraction and splits its items against the current vocabulary. */
export async function loadExtraction(id: string): Promise<ExtractionResult | null> {
  const [row] = await db.select().from(extractions).where(eq(extractions.id, id));
  if (!row) return null;
  const stored = await getStoredStatuses(
    row.sourceLanguage,
    row.items.map((i) => i.lemma)
  );
  return {
    id: row.id,
    text: row.text,
    paragraphs: splitParagraphs(row.text),
    translations: row.translations,
    sourceLanguage: row.sourceLanguage,
    targetLanguage: row.targetLanguage,
    items: row.items.filter((i) => !stored.has(i.lemma)),
    knownItems: row.items.filter((i) => stored.get(i.lemma) === "known"),
    costUsd: row.costUsd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listExtractions(): Promise<ExtractionSummary[]> {
  const rows = await db.select().from(extractions).orderBy(desc(extractions.createdAt));
  return Promise.all(
    rows.map(async (row) => {
      const stored = await getStoredStatuses(
        row.sourceLanguage,
        row.items.map((i) => i.lemma)
      );
      return {
        id: row.id,
        preview:
          row.text.length > PREVIEW_LENGTH ? `${row.text.slice(0, PREVIEW_LENGTH)}…` : row.text,
        newCount: row.items.filter((i) => !stored.has(i.lemma)).length,
        totalCount: row.items.length,
        createdAt: row.createdAt,
      };
    })
  );
}
