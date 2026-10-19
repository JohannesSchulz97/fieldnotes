import "server-only";
import OpenAI from "openai";
import type { ResponseUsage } from "openai/resources/responses/responses";
import { recordUsage, type UsageRecord } from "../db/usage";

export const model = process.env.OPENAI_MODEL ?? "gpt-5.5";
export const reasoningEffort = (process.env.OPENAI_REASONING_EFFORT ?? "low") as OpenAI.ReasoningEffort;

/** USD per 1M tokens. Update when OpenAI changes prices or a new model is used. */
const PRICES: Record<string, { input: number; cachedInput: number; output: number }> = {
  "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
};

let client: OpenAI | null = null;

export function getClient(): OpenAI {
  client ??= new OpenAI();
  return client;
}

/** Records the token usage of one call and returns its cost in USD (null if the model has no known price). */
export async function trackUsage(
  kind: UsageRecord["kind"],
  usage: ResponseUsage | undefined
): Promise<number | null> {
  if (!usage) return null;
  const cachedInputTokens = usage.input_tokens_details?.cached_tokens ?? 0;
  const price = PRICES[model];
  const costUsd = price
    ? ((usage.input_tokens - cachedInputTokens) * price.input +
        cachedInputTokens * price.cachedInput +
        usage.output_tokens * price.output) /
      1_000_000
    : null;
  await recordUsage({
    kind,
    model,
    inputTokens: usage.input_tokens,
    cachedInputTokens,
    outputTokens: usage.output_tokens,
    costUsd,
  });
  return costUsd;
}
