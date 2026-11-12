import { createExercisesSkill } from "./create-exercises";

/**
 * The chat's skills: protocols for recurring tasks, each written in its own file. All are in the
 * system prompt for now; with more of them, the prompt would list them and load one when needed.
 */
export function chatSkills(): string[] {
  return [createExercisesSkill()];
}
