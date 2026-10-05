import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  kind: text("kind", { enum: ["extraction", "normalization"] }).notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  cachedInputTokens: integer("cached_input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  /** Null when the model has no known price. */
  costUsd: real("cost_usd"),
  createdAt: text("created_at").notNull(),
});
