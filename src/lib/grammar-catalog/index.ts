import "server-only";
import type { LanguageCode } from "../types";
import fr from "./fr.json";
import { type CatalogConstruct, GrammarCatalog } from "./schema";

/** The committed catalogues; a language without one names constructs freely. */
const FILES: Record<LanguageCode, unknown> = { fr };

const parsed = new Map<LanguageCode, GrammarCatalog | null>();

/** The language's grammar catalogue, validated on first use; null if it has none. */
export function getCatalog(language: LanguageCode): GrammarCatalog | null {
  if (!parsed.has(language)) {
    const file = FILES[language];
    parsed.set(language, file === undefined ? null : GrammarCatalog.parse(file));
  }
  return parsed.get(language)!;
}

/** The constructs to classify against: all but deprecated ones. */
export function activeConstructs(catalog: GrammarCatalog): CatalogConstruct[] {
  return catalog.constructs.filter((c) => !c.deprecated);
}

/**
 * A construct by id, following deprecations to the entry that replaced it. Null if the id is
 * unknown or deprecated without a replacement.
 */
export function getConstruct(language: LanguageCode, id: string): CatalogConstruct | null {
  const catalog = getCatalog(language);
  const byId = new Map(catalog?.constructs.map((c) => [c.id, c]));
  let construct = byId.get(id);
  for (let hops = 0; construct?.deprecated && hops < 10; hops++) {
    construct = construct.deprecated.replacedBy ? byId.get(construct.deprecated.replacedBy) : undefined;
  }
  return construct && !construct.deprecated ? construct : null;
}

/** The card's explanation as one text, if the construct has a card in the given language. */
export function cardExplanation(
  language: LanguageCode,
  construct: CatalogConstruct,
  explanationLanguage: LanguageCode
): string | null {
  const catalog = getCatalog(language);
  if (!construct.card || catalog?.explanationLanguage !== explanationLanguage) return null;
  return `${construct.card.formation} ${construct.card.use}`;
}
