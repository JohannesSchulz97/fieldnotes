import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { LanguageCode, WordKind } from "../types";
import { getClient, LEMMA_RULES, model, reasoningEffort } from "./client";

const CHUNK_SIZE = 150;
const CONCURRENCY = 4;

export interface NormalizedItem {
  language: LanguageCode;
  lemma: string;
  partOfSpeech: string | null;
  kind: WordKind;
  translation: string;
}

const Normalization = z.object({
  sourceLanguage: z.string().describe("ISO 639-1 code of the entries' language"),
  items: z.array(
    z.object({
      lemma: z.string(),
      partOfSpeech: z.string().nullable(),
      kind: z.enum(["word", "expression"]),
      translation: z.string(),
    })
  ),
});

const INSTRUCTIONS = `You convert a learner's list of known vocabulary entries into dictionary lemmas.

Each input line is one entry. Lines may contain noise besides the word or expression: gender markers ("m.", "(f)"), a translation, notes, HTML tags, Anki cloze markup like "{{c1::...}}". Use such hints to pick the right meaning, but output only the lemma. Entries may be inflected forms; convert them to the lemma (e.g. "assise" → "s'asseoir", "chevaux" → "le cheval").

${LEMMA_RULES}

Output one item per line that contains vocabulary, in input order. Keep expressions as one item; do not split them into words. Skip lines without vocabulary (empty, only a translation, proper nouns).`;

async function normalizeChunk(lines: string[]): Promise<NormalizedItem[]> {
  const response = await getClient().responses.parse({
    model,
    reasoning: { effort: reasoningEffort },
    instructions: INSTRUCTIONS,
    input: lines.join("\n"),
    text: { format: zodTextFormat(Normalization, "normalization") },
  });
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("LLM returned no parseable normalization");
  const language = parsed.sourceLanguage.toLowerCase();
  return parsed.items.map((item) => ({ ...item, language }));
}

/** Normalizes free-form entries (one per line) into lemmas, in chunks of CHUNK_SIZE lines. */
export async function llmNormalize(lines: string[]): Promise<NormalizedItem[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) chunks.push(lines.slice(i, i + CHUNK_SIZE));

  const results: NormalizedItem[][] = [];
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    results.push(...(await Promise.all(chunks.slice(i, i + CONCURRENCY).map(normalizeChunk))));
  }
  return results.flat();
}
