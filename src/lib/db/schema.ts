import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { CEFR_LEVELS, GRAMMAR_CATEGORY_VALUES } from "../grammar";
import type { ExtractedItem } from "../types";

export const vocabEntries = sqliteTable(
  "vocab_entries",
  {
    id: text("id").primaryKey(),
    language: text("language").notNull(),
    lemma: text("lemma").notNull(),
    partOfSpeech: text("part_of_speech"),
    kind: text("kind", { enum: ["word", "expression"] }).notNull(),
    status: text("status", { enum: ["known", "ignored"] }).notNull(),
    source: text("source", { enum: ["extraction", "manual", "anki", "basic"] })
      .notNull()
      .default("extraction"),
    translation: text("translation"),
    translationLanguage: text("translation_language").notNull(),
    exampleSentence: text("example_sentence"),
    /** ISO timestamps, matching VocabEntry. */
    exportedAt: text("exported_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("vocab_entries_language_lemma_idx").on(t.language, t.lemma)]
);

/** One row per OpenAI call, for cost tracking. */
export const llmUsage = sqliteTable("llm_usage", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["extraction", "normalization", "translation", "grammar"] }).notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  cachedInputTokens: integer("cached_input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  /** Null when the model has no known price. */
  costUsd: real("cost_usd"),
  createdAt: text("created_at").notNull(),
});

/** A pasted text and the model's full item list. The new/known split is computed on load. */
export const extractions = sqliteTable(
  "extractions",
  {
    id: text("id").primaryKey(),
    /** SHA-256 of the trimmed text; the same text is never extracted twice unless re-extracted. */
    textHash: text("text_hash").notNull(),
    text: text("text").notNull(),
    sourceLanguage: text("source_language").notNull(),
    targetLanguage: text("target_language").notNull(),
    items: text("items", { mode: "json" }).$type<ExtractedItem[]>().notNull(),
    /** English translation per sentence, aligned with splitSentences(text); null until translated. */
    translations: text("translations", { mode: "json" }).$type<string[]>(),
    /** Cost of the latest LLM run for this text. */
    costUsd: real("cost_usd"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("extractions_text_hash_idx").on(t.textHash)]
);

/** A grammatical construct saved for practice. Identity: (language, name). */
export const grammarItems = sqliteTable(
  "grammar_items",
  {
    id: text("id").primaryKey(),
    language: text("language").notNull(),
    /** Canonical name as the LLM gives it, e.g. "gérondif (en + participe présent)". */
    name: text("name").notNull(),
    category: text("category", { enum: GRAMMAR_CATEGORY_VALUES }).notNull(),
    /** CEFR level as estimated by the LLM. */
    level: text("level", { enum: CEFR_LEVELS }).notNull(),
    explanation: text("explanation").notNull(),
    explanationLanguage: text("explanation_language").notNull(),
    status: text("status", { enum: ["to_work_on", "learned"] }).notNull().default("to_work_on"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("grammar_items_language_name_idx").on(t.language, t.name)]
);

/** Example sentences of a grammar item: from a read text ("source") or written by the LLM ("generated"). */
export const grammarExamples = sqliteTable(
  "grammar_examples",
  {
    id: text("id").primaryKey(),
    grammarItemId: text("grammar_item_id")
      .notNull()
      .references(() => grammarItems.id, { onDelete: "cascade" }),
    origin: text("origin", { enum: ["source", "generated"] }).notNull(),
    sentence: text("sentence").notNull(),
    /** The part of the sentence that shows the construct, copied exactly. */
    form: text("form").notNull(),
    translation: text("translation"),
    /** For source examples: the extraction and sentence number (as in splitSentences) it was selected in. */
    extractionId: text("extraction_id"),
    sentenceIndex: integer("sentence_index"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("grammar_examples_item_sentence_idx").on(t.grammarItemId, t.sentence)]
);

/** App settings as JSON values under a fixed key, e.g. "anki". */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").notNull(),
});
