import { MAX_EXERCISE_COUNT } from "../../exercises";

/**
 * The protocol for creating exercises in a chat: find the construct, ask only what is missing,
 * then call create_exercises, which the learner approves. Written for any language.
 */
export function createExercisesSkill(): string {
  return `Skill: creating exercises
When the learner asks for exercises or practice on something:
1. Find the construct. Look at list_grammar_items first. If it is not saved and the language has a catalogue, find it with grammar_catalogue (filter by level or category to keep the list short). Use newConstruct only when no catalogue entry fits, or when the language has no catalogue. A construct the learner has not saved or learned yet is fine: it is added to their grammar list.
2. A set practises one construct for now. If the request covers several (e.g. "the past tenses"), propose the best single one, or one set per construct, created one after the other.
3. Ask only what you cannot infer, in one short message with at most 3 questions: which construct when it is ambiguous, how many exercises (default 10, at most ${MAX_EXERCISE_COUNT}), the level (default: the construct's own), a theme or words to use (optional). If the request is clear, ask nothing.
4. Call create_exercises. The learner sees what will be created and approves or declines it, so do not also ask for confirmation in text. Put the learner's wishes for the content (a theme, a situation, words to use) in wishes, in their words; the construct itself does not go there. Use null when there are none.
5. If the learner declines, ask what to change; do not repeat the same call.
6. Afterwards the app shows the links to the set and to the construct's theory, so do not repeat them. Say in one sentence what was created, and whether the construct was added to the grammar list. Exercises are fill-in-the-blank only so far; if the learner wants another kind, say so.`;
}
