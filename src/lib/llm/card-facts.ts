import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { CardFacts, ExtractedItem, LanguageCode } from "../types";
import { getClient, model, reasoningEffort, trackUsage } from "./client";
import { cardFactsInstructions } from "./prompts";

const CardFactsResult = z.object({
  words: z.array(
    z.object({
      word: z.number().int(),
      pattern: z.string().nullable(),
      forms: z.string().nullable(),
      register: z.enum(["familiar", "formal", "literary", "vulgar"]).nullable(),
      shortExample: z.string().nullable(),
      shortExampleTranslation: z.string().nullable(),
    })
  ),
});

/** Words per call, so the output of a large export stays within limits. */
const CHUNK_SIZE = 100;

const clean = (text: string | null) => text?.trim() || null;

function describe(item: ExtractedItem, i: number): string {
  const parts = [
    `[${i}] ${item.lemma}`,
    item.partOfSpeech ?? "no part of speech",
    item.gender ? `gender ${item.gender}` : null,
    `translation: ${item.translation}`,
    `sentence: ${item.exampleSentence}`,
  ];
  return parts.filter(Boolean).join(" | ");
}

async function factsFor(language: LanguageCode, items: ExtractedItem[]): Promise<(CardFacts | null)[]> {
  const response = await getClient().responses.parse({
    model,
    reasoning: { effort: reasoningEffort },
    instructions: cardFactsInstructions(language),
    input: items.map(describe).join("\n"),
    text: { format: zodTextFormat(CardFactsResult, "card_facts") },
  });
  await trackUsage("cards", response.usage);
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("LLM returned no parseable card facts");
  const facts: (CardFacts | null)[] = items.map(() => null);
  for (const w of parsed.words) {
    if (w.word < 0 || w.word >= items.length) continue;
    const shortExample = clean(w.shortExample);
    facts[w.word] = {
      pattern: clean(w.pattern),
      forms: clean(w.forms),
      register: w.register,
      shortExample,
      shortExampleTranslation: shortExample ? clean(w.shortExampleTranslation) : null,
    };
  }
  return facts;
}

/** Card facts for the items, aligned with them; an item the model did not return gets null. */
export async function llmCardFacts(
  language: LanguageCode,
  items: ExtractedItem[]
): Promise<(CardFacts | null)[]> {
  const chunks = Array.from({ length: Math.ceil(items.length / CHUNK_SIZE) }, (_, i) =>
    items.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
  );
  return (await Promise.all(chunks.map((chunk) => factsFor(language, chunk)))).flat();
}
