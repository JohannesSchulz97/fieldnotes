/** Exercise counts the learner can pick when creating a set. */
export const EXERCISE_COUNTS = [5, 10, 20] as const;

export const DEFAULT_EXERCISE_COUNT = 10;

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
