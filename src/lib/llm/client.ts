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

/** Cost in USD of one call's tokens; null if the model has no known price. */
function costOf(inputTokens: number, cachedInputTokens: number, outputTokens: number): number | null {
  const price = PRICES[model];
  return price
    ? ((inputTokens - cachedInputTokens) * price.input +
        cachedInputTokens * price.cachedInput +
        outputTokens * price.output) /
        1_000_000
    : null;
}

/** Records the token usage of one call and returns its cost in USD (null if the model has no known price). */
export async function trackUsage(
  kind: UsageRecord["kind"],
  usage: ResponseUsage | undefined
): Promise<number | null> {
  if (!usage) return null;
  const cachedInputTokens = usage.input_tokens_details?.cached_tokens ?? 0;
  const costUsd = costOf(usage.input_tokens, cachedInputTokens, usage.output_tokens);
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

/** Like trackUsage, for token counts that do not come from the OpenAI SDK (the chat's). */
export async function trackTokenUsage(
  kind: UsageRecord["kind"],
  tokens: { inputTokens: number; cachedInputTokens: number; outputTokens: number }
): Promise<void> {
  await recordUsage({
    kind,
    model,
    ...tokens,
    costUsd: costOf(tokens.inputTokens, tokens.cachedInputTokens, tokens.outputTokens),
  });
}
