/** What create_exercises returns, shared by the tool and the chat's card for it. */
export interface CreateExercisesOutput {
  setHref: string;
  count: number;
  level: string;
  constructs: { name: string; theoryHref: string; addedToGrammar: boolean }[];
}
