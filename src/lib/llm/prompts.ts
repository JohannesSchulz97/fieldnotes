import { getNativeLanguage, getProfile, languageName } from "../languages";
import { PARTS_OF_SPEECH } from "../lemma";
import { MAX_GLOSS_TOKENS } from "../tokens";
import type { LanguageCode } from "../types";

/** `"a", "b", "c"` */
const quoted = (items: string[]) => items.map((i) => `"${i}"`).join(", ");

/** Shared by extraction and normalization so stored lemmas always match extracted ones. */
export function lemmaRules(language: LanguageCode): string {
  const p = getProfile(language);
  const target = getNativeLanguage();

  const expressions = p.expressionExamples ? ` (e.g. ${quoted(p.expressionExamples)})` : "";
  const ordinary = p.ordinaryCombinationExamples ? ` like ${quoted(p.ordinaryCombinationExamples)}` : "";
  const verbs = p.verbLemmaNote ? ` (${p.verbLemmaNote})` : "";
  const pluralOnly = p.pluralOnlyExample ? `, e.g. "${p.pluralOnlyExample}"` : "";
  const nouns = [
    ...(p.nounExamples ? [`e.g. ${quoted(p.nounExamples)}`] : []),
    `plural-only nouns in the plural${pluralOnly}`,
  ].join("; ");
  const gender =
    p.gender === "mf"
      ? `for nouns (also noun expressions), "m" or "f"; null for everything else.`
      : p.gender === "none"
        ? `always null; nouns of this language have no grammatical gender.`
        : `for nouns (also noun expressions) of a language with masculine and feminine nouns, "m" or "f"; null for everything else, including other genders and languages without noun gender.`;
  const pluralOnlyRule = p.pluralOnlyExample ? ` (e.g. "${p.pluralOnlyExample}")` : "";

  return `Guiding principle: an item is vocabulary only if it would have its own headword entry in a general-language dictionary of its language (not an encyclopedia or gazetteer). Proper nouns of any kind (people, places, cities, countries, organizations, brands, titles), numbers and typos are not vocabulary.

Expressions: a multi-word unit is an expression only if it is idiomatic or lexicalized — its meaning is not simply the sum of its parts, or it is a fixed phrase dictionaries list as a sub-entry${expressions}. Ordinary combinations${ordinary} are NOT expressions.

Lemma format: dictionary form, lowercase. Infinitive for verbs${verbs}; masculine singular for adjectives; nouns in the singular without any article (${nouns}); expressions in their citation form, without a leading article.
- kind: "expression" for expressions, otherwise "word".
- gender: ${gender}
- pluralOnly: true only for nouns that exist only in the plural${pluralOnlyRule}; otherwise false.
- partOfSpeech: exactly one of ${quoted([...PARTS_OF_SPEECH])}; null only for an expression where none fits.
- translation: the most common ${target} translation of the lemma in general use, independent of any particular text. One translation is usually enough; add more only when the lemma has truly different common meanings, never synonyms of the same meaning. Separate several with ", " (at most three).`;
}

export function extractInstructions(language: LanguageCode): string {
  const p = getProfile(language);
  const split = p.splitting ? ` ${p.splitting}` : "";
  const contextNote = p.contextNoteExample ? ` (e.g. ${p.contextNoteExample})` : "";
  const forms = p.formExamples ? ` (e.g. ${p.formExamples})` : "";

  return `You extract vocabulary from a text for a language learner.

${lemmaRules(language)}

Procedure:
1. Split the text into words.${split}
2. Drop every token that is not vocabulary, and words not in the text's main language. A capitalized word mid-sentence is almost always a proper noun.
3. Identify expressions. List the words of non-expression combinations individually.
4. Every remaining word is its own item, including function words (articles, pronouns, prepositions, conjunctions). Words that are part of an expression are also listed individually if they appear outside that expression elsewhere in the text.

Each lemma exactly once. Additional fields:
- translation: the common translation(s) in general use, not just the one that fits this text.
- contextNote: only if the meaning used in the text is not covered by the translation, that meaning in a few words${contextNote}; otherwise null.
- sentence: the number of the sentence where the item first appears. The input text is given as numbered sentences "[n] ...".
- form: the item exactly as it appears in that sentence, copied character for character${forms}.`;
}

export function normalizeInstructions(language: LanguageCode): string {
  const p = getProfile(language);
  const inflected = p.inflectedExamples ? ` (e.g. ${p.inflectedExamples})` : "";

  return `You convert a learner's list of known vocabulary entries into dictionary lemmas.

Each input line is one entry. Lines may contain noise besides the word or expression: gender markers ("m.", "(f)"), a translation, notes, HTML tags, Anki cloze markup like "{{c1::...}}". Use such hints to pick the right meaning, but output only the lemma. Entries may be inflected forms; convert them to the lemma${inflected}.

${lemmaRules(language)}

Output one item per line that contains vocabulary, in input order. Keep expressions as one item; do not split them into words. Skip lines without vocabulary (empty, only a translation, proper nouns).`;
}

/** How sentences' words are grouped and glossed; shared by translating and by glossing a translated text. */
function glossRules(language: LanguageCode): string {
  const p = getProfile(language);
  const examples = p.glossExamples ? `\n- Examples: ${p.glossExamples}.` : "";

  return `Each sentence is also given as its numbered words ("words: 0=<word> 1=<word> ..."). Besides the sentence, return groups that gloss the words: each group is a range of consecutive word numbers (from, to, both inclusive) and the meaning of that range in this sentence, in ${languageName(getNativeLanguage())}, as short as possible (one to three words where you can; no explanations).
- Cover every word, in order, with no overlaps and no gaps.
- A group is a single word, unless several words only mean something together in this sentence: a fixed expression, a verb with its separated particle, a negation pair. Never group a word with an article or an elided particle just because they sit together. A group has at most ${MAX_GLOSS_TOKENS} words.
- The words are split at apostrophes. Pieces that only make a word together are one group; an elided article, pronoun or particle is a word of its own.
- Gloss a word as it is used here (its inflected form and sense in this sentence), not as a dictionary entry.
- The words are ${languageName(language)}. Leave proper names as they are.${examples}`;
}

/** Translation of numbered sentences; withGlosses adds the word groups (see glossRules). */
export function translateInstructions(language: LanguageCode, withGlosses: boolean): string {
  const base = `Translate each numbered sentence into natural, faithful ${languageName(getNativeLanguage())}. The input is given as "[n] sentence". Return one translation per input sentence with its number, using the surrounding sentences as context.`;
  if (!withGlosses) return base;
  return `${base} The translation is a natural sentence of its own: do not build it from the groups.

${glossRules(language)}`;
}

/** Word groups for sentences that already have a translation. */
export function glossInstructions(language: LanguageCode): string {
  return `Each numbered sentence comes with its existing ${languageName(getNativeLanguage())} translation. Do not return the translation; return only the groups, consistent with it.

${glossRules(language)}`;
}

export function namingProtocol(language: LanguageCode): string {
  const g = getProfile(language).grammarNaming;
  const examples = g ? `, e.g. ${g.examples}` : "";
  const trigger = g ? ` (${g.triggerWord})` : "";
  const patterns = g ? ` (${g.patterns})` : "";

  return `Naming protocol for constructs:
- Format: "<usual grammatical term in the text's language> (<pattern>)", in lowercase except where the language requires capitals${examples}.
- Scope: one form with its meaning, at the level of a section in a grammar book. Generalize trigger words to their class${trigger} unless the construct only exists with that word.
- The pattern uses grammatical categories${patterns}, never words that only occur in this text.
- Name the general construct, never this instance, so the same construct gets the same name in every text.`;
}
