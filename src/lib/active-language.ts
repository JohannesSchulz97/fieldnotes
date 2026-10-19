import "server-only";
import { cookies } from "next/headers";
import type { LanguageCode } from "./types";
import { getLearningLanguages } from "./db/settings";

export const LANGUAGE_COOKIE = "language";

/** The language whose vocabulary, grammar and sources are shown: the cookie's, if it is still a learning language. */
export async function getActiveLanguage(): Promise<LanguageCode> {
  const [learning, store] = await Promise.all([getLearningLanguages(), cookies()]);
  const chosen = store.get(LANGUAGE_COOKIE)?.value;
  return chosen && learning.includes(chosen) ? chosen : learning[0];
}
