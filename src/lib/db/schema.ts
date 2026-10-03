import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const vocabEntries = sqliteTable(
  "vocab_entries",
  {
    id: text("id").primaryKey(),
    language: text("language").notNull(),
    lemma: text("lemma").notNull(),
    partOfSpeech: text("part_of_speech"),
    kind: text("kind", { enum: ["word", "expression"] }).notNull(),
    status: text("status", { enum: ["known", "ignored"] }).notNull(),
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
