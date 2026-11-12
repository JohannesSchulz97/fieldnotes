import Link from "next/link";
import { connection } from "next/server";
import { ExerciseChat } from "@/components/exercise-chat";
import { getActiveLanguage } from "@/lib/active-language";
import { listExerciseSets } from "@/lib/db/exercises";
import type { ExerciseSetSummary } from "@/lib/types";

function progress(s: ExerciseSetSummary): string {
  if (s.answered === 0) return `${s.total} exercises`;
  if (s.answered < s.total) return `${s.answered} / ${s.total} done`;
  return `${s.correct} / ${s.total} correct`;
}

export default async function ExercisesPage() {
  await connection();
  const language = await getActiveLanguage();
  const sets = await listExerciseSets(language);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Exercises</h1>
      {/* Keyed by language: a chat belongs to one language. */}
      <ExerciseChat key={language} initialChatId={crypto.randomUUID()} />
      {sets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No exercises yet. Ask for some above, or create them for a construct in the{" "}
          <Link href="/grammar" className="underline underline-offset-4 hover:text-foreground">
            grammar list
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y">
          {sets.map((s) => (
            <li key={s.id}>
              <Link href={`/exercises/${s.id}`} className="flex items-baseline gap-4 py-2 hover:bg-muted/50">
                <span className="w-24 shrink-0 text-sm text-muted-foreground">{s.createdAt.slice(0, 10)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.grammarItemName}</span>
                <span className="shrink-0 text-sm text-muted-foreground">{progress(s)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
