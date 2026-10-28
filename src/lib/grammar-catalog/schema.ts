import { z } from "zod";
import { CEFR_LEVELS, GRAMMAR_CATEGORY_VALUES } from "../grammar";

/**
 * Format of a grammar catalogue: the fixed list of constructs of one language, built from
 * authoritative sources by the /grammar-catalog command (see SPEC.md). Shared by the app and
 * scripts/validate-grammar-catalog.mts.
 */

/** Lowercase ASCII words joined by "-". Stable forever: saved grammar items refer to it. */
const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be a lowercase ascii slug");

export const CatalogSource = z.object({
  id: Id,
  /** Full bibliographic title, e.g. "Niveau B1 pour le français (Beacco et al., Didier 2011)". */
  title: z.string().min(1),
  url: z.string().url().nullable(),
  /** What kind of source, for weighing it. */
  type: z.enum(["reference-level-description", "official-curriculum", "reference-grammar", "other"]),
});

/** Reviewed reference explanation of a construct, written from the sources (never copied). */
export const ConstructCard = z.object({
  /** How the construct is built, in 1-3 sentences. */
  formation: z.string().min(1),
  /** What it expresses and when it is used, in 1-3 sentences. */
  use: z.string().min(1),
  /** Typical learner mistakes and traps, one short sentence each. */
  pitfalls: z.array(z.string().min(1)).max(5),
  /** Related constructs it is easily confused with, by id, and how they differ. */
  contrasts: z.array(z.object({ id: Id, note: z.string().min(1) })).max(5),
  /** Short everyday sentences in the catalogue's language, with the part showing the construct. */
  examples: z
    .array(z.object({ sentence: z.string().min(1), form: z.string().min(1), translation: z.string().min(1) }))
    .min(2)
    .max(4),
});

export const CatalogConstruct = z.object({
  id: Id,
  /** Canonical name in the language's own grammatical terminology, following the naming rules. */
  name: z.string().min(1),
  /** Other common names, in the language and in English, to help classification. */
  aliases: z.array(z.string().min(1)),
  category: z.enum(GRAMMAR_CATEGORY_VALUES),
  /** CEFR level at which the construct is introduced, from the sources. */
  level: z.enum(CEFR_LEVELS),
  /** What the construct is, in one line, in the explanation language. */
  description: z.string().min(1),
  /** True only if the construct exists only with specific words, e.g. "ne … que". */
  lexical: z.boolean(),
  /** Ids of the catalogue sources that list it. */
  sources: z.array(Id).min(1),
  /** Set when the entry should no longer be used; ids are never removed or reused. */
  deprecated: z.object({ replacedBy: Id.nullable(), reason: z.string().min(1) }).optional(),
  /** Added in phase 2. */
  card: ConstructCard.optional(),
});

export const GrammarCatalog = z.object({
  /** ISO 639-1 code of the language the constructs belong to. */
  language: z.string().regex(/^[a-z]{2}$/),
  /** ISO 639-1 code of the language descriptions and cards are written in. */
  explanationLanguage: z.string().regex(/^[a-z]{2}$/),
  sources: z.array(CatalogSource).min(1),
  constructs: z.array(CatalogConstruct).min(1),
});

export type GrammarCatalog = z.infer<typeof GrammarCatalog>;
export type CatalogConstruct = z.infer<typeof CatalogConstruct>;
export type ConstructCard = z.infer<typeof ConstructCard>;

/**
 * Checks what the schema cannot: unique ids and names, references to existing sources and
 * constructs, and that names of non-lexical constructs contain no example words. Returns
 * human-readable problems; empty if the catalogue is consistent.
 */
export function catalogProblems(catalog: GrammarCatalog): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const names = new Map<string, string>();
  const sourceIds = new Set(catalog.sources.map((s) => s.id));
  const constructIds = new Set(catalog.constructs.map((c) => c.id));

  for (const c of catalog.constructs) {
    if (ids.has(c.id)) problems.push(`duplicate id "${c.id}"`);
    ids.add(c.id);
    const key = c.name.toLowerCase();
    if (names.has(key)) problems.push(`"${c.id}" has the same name as "${names.get(key)}"`);
    names.set(key, c.id);
    for (const s of c.sources) {
      if (!sourceIds.has(s)) problems.push(`"${c.id}" cites unknown source "${s}"`);
    }
    for (const x of c.card?.contrasts ?? []) {
      if (!constructIds.has(x.id)) problems.push(`"${c.id}" contrasts with unknown construct "${x.id}"`);
    }
    if (c.deprecated?.replacedBy && !constructIds.has(c.deprecated.replacedBy)) {
      problems.push(`"${c.id}" is replaced by unknown construct "${c.deprecated.replacedBy}"`);
    }
    // Only the pattern in parentheses can name an instance; the term before it is the
    // construct's own name, which may share a word with examples ("cause" / "à cause de").
    const pattern = c.name.match(/\(([^)]*)\)/)?.[1] ?? "";
    const nameWords = new Set(pattern.toLowerCase().split(/[^\p{L}']+/u));
    for (const e of c.card?.examples ?? []) {
      if (!e.sentence.includes(e.form)) problems.push(`"${c.id}": example form "${e.form}" not in its sentence`);
      // A name like "participe présent (étant)" names an instance, not the construct.
      const formWords = e.form.toLowerCase().split(/[^\p{L}']+/u).filter((w) => w.length > 3);
      if (!c.lexical && formWords.some((w) => nameWords.has(w))) {
        problems.push(`"${c.id}": name contains the example word(s) "${e.form}" but the construct is not lexical`);
      }
    }
  }
  return problems;
}
