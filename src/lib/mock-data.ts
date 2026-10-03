import type { ExtractionResult, VocabEntry } from "./types";

/** Temporary stand-in for the LLM extraction (step 4). Ignores the input text. */
export async function mockExtract(_text: string): Promise<ExtractionResult> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return {
    sourceLanguage: "fr",
    targetLanguage: "en",
    items: [
      {
        lemma: "se rendre compte",
        surfaceForms: ["s'est rendu compte"],
        partOfSpeech: "verb",
        kind: "expression",
        translation: "to realize",
        exampleSentence: "Il s'est rendu compte de son erreur trop tard.",
        occurrences: 1,
      },
      {
        lemma: "épuisé",
        surfaceForms: ["épuisée"],
        partOfSpeech: "adjective",
        kind: "word",
        translation: "exhausted",
        exampleSentence: "Elle était épuisée après le voyage.",
        occurrences: 1,
      },
      {
        lemma: "le quai",
        surfaceForms: ["quai"],
        partOfSpeech: "noun",
        kind: "word",
        translation: "platform (train station)",
        exampleSentence: "Le train attendait sur le quai numéro trois.",
        occurrences: 2,
      },
      {
        lemma: "rater",
        surfaceForms: ["raté", "rate"],
        partOfSpeech: "verb",
        kind: "word",
        translation: "to miss (a train, bus)",
        exampleSentence: "J'ai raté le dernier train.",
        occurrences: 2,
      },
    ],
    stats: { totalLemmas: 42, knownCount: 38, unknownCount: 4 },
  };
}

export const mockVocab: VocabEntry[] = [
  {
    id: "1",
    language: "fr",
    lemma: "la gare",
    partOfSpeech: "noun",
    kind: "word",
    status: "known",
    translation: "train station",
    translationLanguage: "en",
    exampleSentence: "On se retrouve à la gare.",
    exportedAt: "2026-10-01T10:00:00.000Z",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
  },
  {
    id: "2",
    language: "fr",
    lemma: "avoir du mal à",
    partOfSpeech: null,
    kind: "expression",
    status: "known",
    translation: "to have trouble doing",
    translationLanguage: "en",
    exampleSentence: "J'ai du mal à dormir.",
    exportedAt: null,
    createdAt: "2026-10-02T09:30:00.000Z",
    updatedAt: "2026-10-02T09:30:00.000Z",
  },
  {
    id: "3",
    language: "fr",
    lemma: "Marseille",
    partOfSpeech: "proper noun",
    kind: "word",
    status: "ignored",
    translation: null,
    translationLanguage: "en",
    exampleSentence: null,
    exportedAt: null,
    createdAt: "2026-10-02T09:31:00.000Z",
    updatedAt: "2026-10-02T09:31:00.000Z",
  },
];
