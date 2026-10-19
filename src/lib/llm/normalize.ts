import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { normalizeLemma } from "../lemma";
import type { Gender, LanguageCode, WordKind } from "../types";
import { getClient, model, reasoningEffort, trackUsage } from "./client";
import { normalizeInstructions } from "./prompts";

const CHUNK_SIZE = 150;
const CONCURRENCY = 4;

export interface NormalizedItem {
  lemma: string;
  partOfSpeech: string | null;
  kind: WordKind;
  gender: Gender | null;
  pluralOnly: boolean;
  translation: string;
}

const Normalization = z.object({
  items: z.array(
    z.object({
      lemma: z.string(),
      partOfSpeech: z.string().nullable(),
      kind: z.enum(["word", "expression"]),
      gender: z.enum(["m", "f"]).nullable(),
      pluralOnly: z.boolean(),
      translation: z.string(),
    })
  ),
});

interface ChunkResult {
  items: NormalizedItem[];
  costUsd: number | null;
}

async function normalizeChunk(language: LanguageCode, lines: string[]): Promise<ChunkResult> {
  const response = await getClient().responses.parse({
    model,
    reasoning: { effort: reasoningEffort },
    instructions: normalizeInstructions(language),
    input: lines.join("\n"),
    text: { format: zodTextFormat(Normalization, "normalization") },
  });
  const costUsd = await trackUsage("normalization", response.usage);
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("LLM returned no parseable normalization");
  return {
    items: parsed.items.map((item) => ({ ...item, lemma: normalizeLemma(item.lemma) })),
    costUsd,
  };
}

/**
 * Normalizes free-form entries (one per line) of a language into lemmas, in chunks of CHUNK_SIZE lines.
 * costUsd is the summed cost, or null if any chunk had an unknown price.
 */
export async function llmNormalize(
  language: LanguageCode,
  lines: string[]
): Promise<{ items: NormalizedItem[]; costUsd: number | null }> {
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) chunks.push(lines.slice(i, i + CHUNK_SIZE));

  const results: ChunkResult[] = [];
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    results.push(...(await Promise.all(chunks.slice(i, i + CONCURRENCY).map((chunk) => normalizeChunk(language, chunk)))));
  }
  const costs = results.map((r) => r.costUsd);
  return {
    items: results.flatMap((r) => r.items),
    costUsd: costs.includes(null) ? null : (costs as number[]).reduce((a, b) => a + b, 0),
  };
}
