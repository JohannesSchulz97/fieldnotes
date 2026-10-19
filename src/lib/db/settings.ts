import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { DEFAULT_LANGUAGE, isLearnable } from "../languages";
import type { AnkiSettings, LanguageCode } from "../types";
import { db } from ".";
import { settings } from "./schema";

export const DEFAULT_ANKI_SETTINGS: AnkiSettings = {
  direction: "learning-native",
  example: "off",
  sentenceTranslation: false,
  partOfSpeech: true,
};

export const AnkiSettingsSchema = z.object({
  direction: z.enum(["learning-native", "native-learning", "both"]),
  example: z.enum(["off", "front", "back"]),
  sentenceTranslation: z.boolean(),
  partOfSpeech: z.boolean(),
});

const LEGACY_DIRECTIONS: Record<string, string> = { "fr-en": "learning-native", "en-fr": "native-learning" };

/** Stored Anki settings, falling back to defaults for anything missing or invalid. */
export async function getAnkiSettings(): Promise<AnkiSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "anki"));
  const stored = (row?.value ?? {}) as Record<string, unknown>;
  // Settings saved before languages were generic used "fr-en" / "en-fr" for the direction.
  const direction = LEGACY_DIRECTIONS[stored.direction as string] ?? stored.direction;
  const parsed = AnkiSettingsSchema.safeParse({ ...DEFAULT_ANKI_SETTINGS, ...stored, direction });
  return parsed.success ? parsed.data : DEFAULT_ANKI_SETTINGS;
}

export async function saveAnkiSettings(value: AnkiSettings): Promise<void> {
  const updatedAt = new Date().toISOString();
  await db
    .insert(settings)
    .values({ key: "anki", value, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } });
}

/** The languages being learned, in the order they were added; always at least the default. */
export async function getLearningLanguages(): Promise<LanguageCode[]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "languages"));
  const parsed = z.array(z.string()).safeParse(row?.value);
  const languages = parsed.success ? parsed.data.filter(isLearnable) : [];
  return languages.length > 0 ? languages : [DEFAULT_LANGUAGE];
}

/** Adds a learning language; a language already in the list stays where it is. */
export async function addLearningLanguage(language: LanguageCode): Promise<void> {
  if (!isLearnable(language)) throw new Error("Unsupported language");
  const value = [...new Set([...(await getLearningLanguages()), language])];
  const updatedAt = new Date().toISOString();
  await db
    .insert(settings)
    .values({ key: "languages", value, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } });
}
