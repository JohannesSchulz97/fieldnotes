import type { ExerciseWord } from "./types";

/** Exercise counts the learner can pick when creating a set. */
export const EXERCISE_COUNTS = [5, 10, 20] as const;

export const DEFAULT_EXERCISE_COUNT = 10;

/** Most exercises one set may have, whoever asks for it (the button or the chat). */
export const MAX_EXERCISE_COUNT = 20;

/**
 * Kinds of exercise. Only fill-in-the-blank exists so far; a new kind adds its value here, its
 * generator and its view in the player.
 */
export const EXERCISE_TYPES = ["fill_blank"] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number];

/** Longest free-text wish (theme, words, situation) that goes along with a request for exercises. */
export const MAX_EXERCISE_BRIEF_LENGTH = 1_000;

/** Share of correct answers from which the summary suggests marking the construct learned. */
export const LEARNED_SUGGESTION_SCORE = 0.9;

/** Comparison key for answers: case, typographic apostrophes, spacing and end punctuation don't count. */
export function answerKey(answer: string): string {
  return answer
    .replace(/[’‘ʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:!?…]+$/, "")
    .trim()
    .toLowerCase();
}

/** answerKey without diacritics, to tell "almost, check the accents" apart from wrong. */
function withoutAccents(key: string): string {
  return key.normalize("NFD").replace(/\p{M}/gu, "");
}

export type Grade = "correct" | "accents" | "wrong";

/** Grades an answer against the expected answer and its accepted alternatives. Accents count. */
export function gradeAnswer(answer: string, expected: string[]): Grade {
  const key = answerKey(answer);
  if (!key) return "wrong";
  const keys = expected.map(answerKey);
  if (keys.includes(key)) return "correct";
  if (keys.map(withoutAccents).includes(withoutAccents(key))) return "accents";
  return "wrong";
}

/** A piece of text, with the word it shows if it is one of the exercise's words. */
export interface TextPart {
  text: string;
  word: ExerciseWord | null;
}

const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/**
 * Splits text into parts at the first whole-word occurrence of each word's form. Longer forms win
 * where forms overlap, so an expression is not cut into its words.
 */
export function splitWords(text: string, words: ExerciseWord[]): TextPart[] {
  const spans: { start: number; end: number; word: ExerciseWord }[] = [];
  for (const word of words) {
    for (let i = text.indexOf(word.form); i !== -1; i = text.indexOf(word.form, i + 1)) {
      const end = i + word.form.length;
      if (!isWordChar(text[i - 1]) && !isWordChar(text[end])) {
        spans.push({ start: i, end, word });
        break;
      }
    }
  }
  spans.sort((a, b) => b.end - b.start - (a.end - a.start));
  const chosen: typeof spans = [];
  for (const s of spans) {
    if (!chosen.some((c) => s.start < c.end && c.start < s.end)) chosen.push(s);
  }
  chosen.sort((a, b) => a.start - b.start);

  const parts: TextPart[] = [];
  let pos = 0;
  for (const s of chosen) {
    if (s.start > pos) parts.push({ text: text.slice(pos, s.start), word: null });
    parts.push({ text: text.slice(s.start, s.end), word: s.word });
    pos = s.end;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), word: null });
  return parts;
}
