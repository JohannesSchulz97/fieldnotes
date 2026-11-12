"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  addToExercisesSource,
  findExtractionByHash,
  getExtractionSentences,
  getExtractionText,
  hashText,
  insertExtraction,
  saveGlosses,
  saveTranslations,
  updateExtraction,
  updateSourceDetails,
} from "@/lib/db/extractions";
import {
  addGrammarExamples,
  createGrammarItem,
  deleteGrammarItem as dbDeleteGrammarItem,
  type ExampleRecord,
  getGrammarItemLanguage,
  listGrammarItems,
  listGrammarNames,
  setGrammarStatus as dbSetGrammarStatus,
} from "@/lib/db/grammar";
import {
  deleteExerciseSet as dbDeleteExerciseSet,
  getExerciseSentence,
  getExpectedAnswers,
  recordAttempt,
} from "@/lib/db/exercises";
import { getActiveLanguage, LANGUAGE_COOKIE } from "@/lib/active-language";
import { activeConstructs, cardExplanation, getCatalog, getConstruct } from "@/lib/grammar-catalog";
import {
  addLearningLanguage,
  AnkiSettingsSchema,
  getLearningLanguages,
  saveAnkiSettings,
} from "@/lib/db/settings";
import { getTotalCost } from "@/lib/db/usage";
import {
  deleteEntry,
  findStoredEntry,
  getStoredEntries,
  upsertEntries,
} from "@/lib/db/vocab";
import { keyItems, matchStored, vocabKey } from "@/lib/lemma";
import { EXERCISE_COUNTS, type Grade, gradeAnswer } from "@/lib/exercises";
import { generateExerciseSet, saveCatalogConstruct } from "@/lib/exercise-generation";
import { llmExtract } from "@/lib/llm/extract";
import {
  CEFR_LEVELS,
  GRAMMAR_CATEGORY_VALUES,
  grammarNameKey,
  normalizeGrammarName,
} from "@/lib/grammar";
import {
  GrammarExplanationSchema,
  type LlmConstruct,
  llmExplainGrammar,
  llmIdentifyGrammar,
  NEW_CONSTRUCT,
} from "@/lib/llm/grammar";
import { getNativeLanguage, isLearnable, languageName } from "@/lib/languages";
import { llmNormalize } from "@/lib/llm/normalize";
import { llmGloss, llmTranslate } from "@/lib/llm/translate";
import { splitSentences } from "@/lib/sentences";
import { parseSourceDetails } from "@/lib/source";
import type {
  AnkiSettings,
  ExtractedItem,
  Gender,
  GrammarExplanation,
  GrammarIdentification,
  GrammarStatus,
  LanguageCode,
  PartOfSpeech,
  WordKind,
  WordStatus,
} from "@/lib/types";

export type ExtractOutcome =
  | { status: "done"; id: string; reused: boolean }
  /** The text is in another language than the active one; nothing was saved. */
  | { status: "mismatch"; detected: LanguageCode; detectedName: string; activeName: string };

/**
 * Extracts vocabulary from a text in the active language and saves the result. A text that was
 * extracted before is not sent to the LLM again; its saved extraction is returned instead.
 * If the text looks like another language, nothing is saved unless force is set.
 */
export async function extract(
  text: string,
  title?: string,
  link?: string,
  force = false
): Promise<ExtractOutcome> {
  if (!text.trim()) throw new Error("Empty text");
  const details = parseSourceDetails(title, link);
  const language = await getActiveLanguage();
  const existing = await findExtractionByHash(hashText(text));
  if (existing) {
    if (existing.sourceLanguage !== language && !force) {
      return {
        status: "mismatch",
        detected: existing.sourceLanguage,
        detectedName: languageName(existing.sourceLanguage),
        activeName: languageName(language),
      };
    }
    // Filling in a title or link when pasting a known text updates that source.
    if (details.title || details.sourceUrl) {
      await updateSourceDetails(existing.id, details);
      revalidatePath("/");
      revalidatePath(`/extractions/${existing.id}`);
    }
    return { status: "done", id: existing.id, reused: true };
  }
  const result = await llmExtract(text, language);
  if (result.detectedLanguage !== language && !force) {
    return {
      status: "mismatch",
      detected: result.detectedLanguage,
      detectedName: languageName(result.detectedLanguage),
      activeName: languageName(language),
    };
  }
  const id = await insertExtraction(text, result, details);
  revalidatePath("/");
  return { status: "done", id, reused: false };
}

/** Sets or clears the title and link of a saved source. */
export async function updateSource(id: string, title: string, link: string): Promise<void> {
  await updateSourceDetails(id, parseSourceDetails(title, link));
  revalidatePath("/");
  revalidatePath(`/extractions/${id}`);
}

/** Translates a saved extraction's text sentence by sentence and stores the result. */
export async function translateExtraction(id: string): Promise<void> {
  const source = await getExtractionText(id);
  if (source === null) throw new Error("Extraction not found");
  const { translations, glosses } = await llmTranslate(
    splitSentences(source.text),
    source.sourceLanguage
  );
  await saveTranslations(id, translations, glosses);
  revalidatePath(`/extractions/${id}`);
}

/** Adds word glosses to an already translated text, keeping its translation. */
export async function glossExtraction(id: string): Promise<void> {
  const source = await getExtractionSentences(id);
  if (source === null) throw new Error("Extraction not found");
  if (!source.translations) throw new Error("Translate the text first");
  await saveGlosses(id, await llmGloss(source.sentences, source.translations, source.sourceLanguage));
  revalidatePath(`/extractions/${id}`);
}

/** Runs the LLM again on a saved extraction's text and replaces its items. */
export async function reextract(id: string): Promise<void> {
  const source = await getExtractionText(id);
  if (source === null) throw new Error("Extraction not found");
  await updateExtraction(id, await llmExtract(source.text, source.sourceLanguage));
  revalidatePath("/");
  revalidatePath(`/extractions/${id}`);
}

export async function markItem(
  item: ExtractedItem,
  language: LanguageCode,
  translationLanguage: LanguageCode,
  status: WordStatus
): Promise<void> {
  if (status !== "known" && status !== "ignored") throw new Error("Invalid status");
  if (!item?.lemma?.trim()) throw new Error("Missing lemma");
  await upsertEntries([item], language, translationLanguage, status, "extraction");
  revalidatePath("/vocab");
  revalidatePath("/");
}

/** Marks exported items as known and records the export time. The file itself is built client-side. */
export async function markExported(
  items: ExtractedItem[],
  language: LanguageCode,
  translationLanguage: LanguageCode
): Promise<void> {
  if (items.length === 0 || items.some((i) => !i?.lemma?.trim())) throw new Error("Invalid items");
  await upsertEntries(items, language, translationLanguage, "known", "extraction", new Date().toISOString());
  revalidatePath("/vocab");
  revalidatePath("/");
}

const MAX_LINES = 5000;

export interface AddKnownResult {
  added: number;
  alreadyStored: number;
  skippedLines: number;
  costUsd: number | null;
  totalCostUsd: number;
}

/** Normalizes pasted entries (one per line) to lemmas of the active language via the LLM and stores them as known. */
export async function addKnownWords(text: string): Promise<AddKnownResult> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error("Nothing to add");
  if (lines.length > MAX_LINES) throw new Error(`Too many lines (max ${MAX_LINES})`);

  const language = await getActiveLanguage();
  const { items, costUsd } = await llmNormalize(language, lines);

  const unique = [...keyItems(items).values()];
  const stored = await getStoredEntries(language, unique);
  const alreadyStored = unique.filter((i) => matchStored(stored, i)).length;
  const added = unique.length - alreadyStored;
  await upsertEntries(items, language, getNativeLanguage(), "known", "manual");
  revalidatePath("/vocab");
  revalidatePath("/");
  return {
    added,
    alreadyStored,
    skippedLines: Math.max(0, lines.length - items.length),
    costUsd,
    totalCostUsd: await getTotalCost(),
  };
}

/** Which stored word to remove: by id, or by the key parts of an item (e.g. from an extraction). */
export type UnmarkTarget =
  | { id: string }
  | { lemma: string; partOfSpeech: PartOfSpeech | null; gender?: Gender | null; kind?: WordKind };

/** Removes a stored word so it shows up as new again. Other words with the same lemma stay. */
export async function unmarkItem(language: LanguageCode, target: UnmarkTarget): Promise<void> {
  if (!language?.trim()) throw new Error("Missing language");
  if ("id" in target) {
    if (!target.id?.trim()) throw new Error("Missing id");
    await deleteEntry(target.id);
  } else {
    if (!target?.lemma?.trim()) throw new Error("Missing lemma");
    const entry = await findStoredEntry(language, target);
    if (entry) await deleteEntry(entry.id);
  }
  revalidatePath("/vocab");
  revalidatePath("/");
}

/** Makes a learning language the active one, for the whole app. */
export async function setActiveLanguage(language: LanguageCode): Promise<void> {
  if (!(await getLearningLanguages()).includes(language)) throw new Error("Not a learning language");
  (await cookies()).set(LANGUAGE_COOKIE, language, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

/** Adds a language to the learning languages and switches to it. */
export async function addLanguage(language: LanguageCode): Promise<void> {
  if (!isLearnable(language)) throw new Error("Unsupported language");
  await addLearningLanguage(language);
  await setActiveLanguage(language);
}

export async function updateAnkiSettings(value: AnkiSettings): Promise<void> {
  await saveAnkiSettings(AnkiSettingsSchema.parse(value));
}

const MAX_SPAN_LENGTH = 300;
/** Sentences before and after the selected one that the LLM sees for meaning. */
const CONTEXT_SENTENCES = 2;

/** Loads the selected sentence from the DB, so the client only sends a reference and the span. */
async function loadSelection(extractionId: string, sentence: number, span: string) {
  const trimmed = span?.trim().replace(/\s+/g, " ") ?? "";
  if (!trimmed || trimmed.length > MAX_SPAN_LENGTH) throw new Error("Invalid selection");
  const data = await getExtractionSentences(extractionId);
  if (!data) throw new Error("Extraction not found");
  const text = data.sentences[sentence];
  if (!Number.isInteger(sentence) || text === undefined) throw new Error("Sentence not found");
  if (!text.replace(/\s+/g, " ").includes(trimmed)) throw new Error("Selection not in sentence");
  return { ...data, span: trimmed, text };
}

/** The selected sentence as a source example; form falls back to the span if not in the sentence. */
function sourceExample(
  s: Awaited<ReturnType<typeof loadSelection>>,
  extractionId: string,
  sentence: number,
  form: string
): ExampleRecord {
  return {
    origin: "source",
    sentence: s.text,
    form: form && s.text.includes(form) ? form : s.span,
    translation: s.translations?.[sentence] || null,
    extractionId,
    sentenceIndex: sentence,
  };
}

/**
 * Lists the grammatical constructs in a span selected in one sentence. Constructs that match a
 * saved item come with that item, so they need no further LLM call.
 */
export async function identifyGrammar(
  extractionId: string,
  sentence: number,
  span: string
): Promise<GrammarIdentification> {
  const s = await loadSelection(extractionId, sentence, span);
  const language = s.sourceLanguage;
  const catalog = getCatalog(language);
  const saved = await listGrammarNames(language);
  const constructs = await llmIdentifyGrammar({
    language,
    span: s.span,
    sentence: s.text,
    context: s.sentences
      .slice(Math.max(0, sentence - CONTEXT_SENTENCES), sentence + CONTEXT_SENTENCES + 1)
      .join(" "),
    catalog: catalog && activeConstructs(catalog),
    savedNames: catalog ? [] : saved.map((i) => i.name),
  });

  // Catalogue constructs match saved items by id; others by name, where spelling details don't count.
  const byConstruct = new Map(saved.flatMap((i) => (i.constructId ? [[i.constructId, i.id]] : [])));
  const byKey = new Map(saved.map((i) => [grammarNameKey(i.name), i.id]));
  const seen = new Set<string>();
  const resolved = constructs.flatMap((c: LlmConstruct) => {
    const entry = c.constructId ? getConstruct(language, c.constructId) : null;
    const name = entry?.name ?? normalizeGrammarName(c.match === NEW_CONSTRUCT ? c.name : c.match);
    if (seen.has(entry?.id ?? grammarNameKey(name))) return [];
    seen.add(entry?.id ?? grammarNameKey(name));
    const itemId = (entry && byConstruct.get(entry.id)) ?? byKey.get(grammarNameKey(name)) ?? null;
    return [{ c, entry, name, itemId }];
  });
  const items = new Map(
    (await listGrammarItems({ ids: resolved.flatMap((r) => (r.itemId ? [r.itemId] : [])) })).map(
      (i) => [i.id, i]
    )
  );
  return {
    hasCatalog: catalog !== null,
    constructs: resolved.map(({ c, entry, name, itemId }) => {
      const item = (itemId && items.get(itemId)) || null;
      return {
        constructId: entry?.id ?? item?.constructId ?? null,
        name: item?.name ?? name,
        category: entry?.category ?? item?.category ?? c.category,
        level: entry?.level ?? item?.level ?? c.level,
        form: c.form,
        gist: c.gist,
        item,
      };
    }),
    savedItems: saved.map(({ id, name }) => ({ id, name })),
  };
}

const ConstructSchema = z.object({
  constructId: z.string().max(100).nullable(),
  name: z.string().trim().min(1).max(200),
  category: z.enum(GRAMMAR_CATEGORY_VALUES),
  level: z.enum(CEFR_LEVELS),
  form: z.string().max(MAX_SPAN_LENGTH),
});

type ConstructInput = z.infer<typeof ConstructSchema>;

/** The catalogue entry a construct from the client refers to; throws for an unknown id. */
function catalogEntry(language: LanguageCode, construct: ConstructInput) {
  if (construct.constructId === null) return null;
  const entry = getConstruct(language, construct.constructId);
  if (!entry) throw new Error("Unknown catalogue construct");
  return entry;
}

/**
 * Explains a new construct found in a selection: from its catalogue card if it has one, otherwise
 * by the LLM. Nothing is stored until it is saved.
 */
export async function explainGrammar(
  extractionId: string,
  sentence: number,
  span: string,
  construct: ConstructInput
): Promise<GrammarExplanation> {
  const s = await loadSelection(extractionId, sentence, span);
  const c = ConstructSchema.parse(construct);
  const entry = catalogEntry(s.sourceLanguage, c);
  const explanation = entry && cardExplanation(s.sourceLanguage, entry, getNativeLanguage());
  if (entry && explanation) {
    return {
      explanation,
      examples: entry.card!.examples.map(({ sentence, form, translation }) => ({ sentence, form, translation })),
    };
  }
  return llmExplainGrammar({
    language: s.sourceLanguage,
    name: entry?.name ?? c.name,
    form: c.form,
    sentence: s.text,
  });
}

/** Saves a new construct with the selected sentence and the generated sentences as examples. */
export async function saveGrammarItem(
  extractionId: string,
  sentence: number,
  span: string,
  construct: ConstructInput,
  explanation: GrammarExplanation
): Promise<void> {
  const s = await loadSelection(extractionId, sentence, span);
  const c = ConstructSchema.parse(construct);
  const e = GrammarExplanationSchema.parse(explanation);
  // For catalogue constructs, name, category and level always come from the catalogue.
  const entry = catalogEntry(s.sourceLanguage, c);
  await createGrammarItem(
    s.sourceLanguage,
    getNativeLanguage(),
    {
      constructId: entry?.id ?? null,
      name: entry?.name ?? c.name,
      category: entry?.category ?? c.category,
      level: entry?.level ?? c.level,
      explanation: e.explanation,
    },
    [
      sourceExample(s, extractionId, sentence, c.form),
      ...e.examples.map((x) => ({
        ...x,
        origin: "generated" as const,
        extractionId: null,
        sentenceIndex: null,
      })),
    ]
  );
  revalidatePath("/grammar");
}

/**
 * Saves a catalogue construct of the active language to the grammar list without a sentence from
 * a text: the card's examples become its examples. Returns the item's id (an existing one if the
 * construct is already tracked).
 */
export async function addCatalogConstruct(constructId: string): Promise<string> {
  const language = await getActiveLanguage();
  const entry = typeof constructId === "string" ? getConstruct(language, constructId) : null;
  if (!entry) throw new Error("Unknown catalogue construct");
  const id = await saveCatalogConstruct(language, entry);
  revalidatePath("/grammar", "layout");
  return id;
}

/** Adds the selected sentence as an example to a saved item. */
export async function addGrammarExample(
  itemId: string,
  extractionId: string,
  sentence: number,
  span: string,
  form: string
): Promise<void> {
  const s = await loadSelection(extractionId, sentence, span);
  const language = await getGrammarItemLanguage(itemId);
  if (language === null) throw new Error("Grammar item not found");
  if (language !== s.sourceLanguage) throw new Error("Grammar item is in another language");
  await addGrammarExamples(itemId, [sourceExample(s, extractionId, sentence, form)]);
  revalidatePath("/grammar");
}

export async function setGrammarStatus(id: string, status: GrammarStatus): Promise<void> {
  if (status !== "to_work_on" && status !== "learned") throw new Error("Invalid status");
  await dbSetGrammarStatus(id, status);
  revalidatePath("/grammar");
  revalidatePath("/exercises", "layout");
}

export async function deleteGrammarItem(id: string): Promise<void> {
  if (!id?.trim()) throw new Error("Missing id");
  await dbDeleteGrammarItem(id);
  revalidatePath("/grammar");
  revalidatePath("/exercises", "layout");
}

/** Generates a set of fill-in-the-blank exercises for a grammar item, using known vocabulary. */
export async function createExercises(grammarItemId: string, count: number): Promise<string> {
  if (!EXERCISE_COUNTS.includes(count as (typeof EXERCISE_COUNTS)[number])) {
    throw new Error("Invalid number of exercises");
  }
  const language = typeof grammarItemId === "string" ? await getGrammarItemLanguage(grammarItemId) : null;
  if (!language) throw new Error("Grammar item not found");
  const { setId } = await generateExerciseSet({
    language,
    targets: [{ kind: "item", itemId: grammarItemId }],
    count,
  });
  revalidatePath("/exercises");
  return setId;
}

const MAX_ANSWER_LENGTH = 200;

/** Grades an answer, records it as the exercise's latest attempt and returns the grade. */
export async function submitExerciseAnswer(exerciseId: string, answer: string): Promise<Grade> {
  if (typeof answer !== "string" || answer.length > MAX_ANSWER_LENGTH) throw new Error("Invalid answer");
  const expected = await getExpectedAnswers(exerciseId);
  if (!expected) throw new Error("Exercise not found");
  const grade = gradeAnswer(answer, expected);
  await recordAttempt(exerciseId, answer.trim(), grade === "correct");
  revalidatePath("/exercises");
  return grade;
}

/**
 * Puts a word of an exercise on the study list: removes it from the vocabulary if it was there
 * (the learner doesn't know it after all) and adds it with its sentence to the language's
 * exercises source, from where it is exported like any new word. Returns the source's id.
 */
export async function studyExerciseWord(exerciseId: string, wordKey: string): Promise<string> {
  const exercise = await getExerciseSentence(exerciseId);
  if (!exercise) throw new Error("Exercise not found");
  const word = exercise.words.find((w) => vocabKey(w) === wordKey);
  if (!word) throw new Error("Word not in exercise");

  // Same lemma rules as extraction, for gender, part of speech and a dictionary translation.
  // Words generated with their own kind, part of speech and gender keep them, as they decide the match.
  const { items } = await llmNormalize(exercise.language, [`${word.lemma} (${word.translation})`]);
  const normalized = items[0];
  const keepsOwn = word.kind !== undefined;
  const item: ExtractedItem = {
    lemma: word.lemma,
    partOfSpeech: keepsOwn ? (word.partOfSpeech ?? null) : (normalized?.partOfSpeech ?? null),
    kind: word.kind ?? normalized?.kind ?? (word.lemma.includes(" ") ? "expression" : "word"),
    gender: keepsOwn ? (word.gender ?? null) : (normalized?.gender ?? null),
    pluralOnly: normalized?.pluralOnly ?? false,
    translation: normalized?.translation || word.translation,
    contextNote: null,
    exampleSentence: exercise.sentence,
    form: word.form,
  };
  // By the item, not the word: an old word without part of speech now has one, so of two stored
  // homographs the right one goes.
  const stored = await findStoredEntry(exercise.language, item);
  if (stored) await deleteEntry(stored.id);
  const sourceId = await addToExercisesSource(
    exercise.language,
    getNativeLanguage(),
    item,
    exercise.translation
  );
  revalidatePath("/");
  revalidatePath("/vocab");
  revalidatePath(`/extractions/${sourceId}`);
  return sourceId;
}

export async function deleteExerciseSet(id: string): Promise<void> {
  if (!id?.trim()) throw new Error("Missing id");
  await dbDeleteExerciseSet(id);
  revalidatePath("/exercises");
}
