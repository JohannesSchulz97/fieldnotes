import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { LanguageCode } from "./types";
import { getLearningLanguages } from "./db/settings";

export const LANGUAGE_COOKIE = "language";

/**
 * The language whose vocabulary, grammar and sources are shown: the cookie's, if it is still a
 * learning language. Memoized per request, since the layout and the page both need it.
 */
export const getActiveLanguage = cache(async (): Promise<LanguageCode> => {
  const [learning, store] = await Promise.all([getLearningLanguages(), cookies()]);
  const chosen = store.get(LANGUAGE_COOKIE)?.value;
  return chosen && learning.includes(chosen) ? chosen : learning[0];
});
