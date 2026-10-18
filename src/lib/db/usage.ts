import "server-only";
import { sum } from "drizzle-orm";
import { db } from ".";
import { llmUsage } from "./schema";

export interface UsageRecord {
  kind: "extraction" | "normalization" | "translation" | "grammar";
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export async function recordUsage(record: UsageRecord): Promise<void> {
  await db.insert(llmUsage).values({
    id: crypto.randomUUID(),
    ...record,
    createdAt: new Date().toISOString(),
  });
}

/** Sum of all recorded costs in USD (calls with unknown price count as 0). */
export async function getTotalCost(): Promise<number> {
  const [row] = await db.select({ total: sum(llmUsage.costUsd) }).from(llmUsage);
  return Number(row?.total ?? 0);
}
