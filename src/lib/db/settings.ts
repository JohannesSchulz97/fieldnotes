import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AnkiSettings } from "../types";
import { db } from ".";
import { settings } from "./schema";

export const DEFAULT_ANKI_SETTINGS: AnkiSettings = {
  direction: "fr-en",
  example: "off",
  sentenceTranslation: false,
  partOfSpeech: true,
};

export const AnkiSettingsSchema = z.object({
  direction: z.enum(["fr-en", "en-fr", "both"]),
  example: z.enum(["off", "front", "back"]),
  sentenceTranslation: z.boolean(),
  partOfSpeech: z.boolean(),
});

/** Stored Anki settings, falling back to defaults for anything missing or invalid. */
export async function getAnkiSettings(): Promise<AnkiSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "anki"));
  const parsed = AnkiSettingsSchema.safeParse({ ...DEFAULT_ANKI_SETTINGS, ...(row?.value as object) });
  return parsed.success ? parsed.data : DEFAULT_ANKI_SETTINGS;
}

export async function saveAnkiSettings(value: AnkiSettings): Promise<void> {
  const updatedAt = new Date().toISOString();
  await db
    .insert(settings)
    .values({ key: "anki", value, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } });
}
