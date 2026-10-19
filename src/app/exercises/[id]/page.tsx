import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ActiveLanguageSync } from "@/components/active-language-sync";
import { ExercisePlayer } from "@/components/exercise-player";
import { getActiveLanguage } from "@/lib/active-language";
import { getExerciseSet } from "@/lib/db/exercises";

export default async function ExerciseSetPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const [set, activeLanguage] = await Promise.all([getExerciseSet(id), getActiveLanguage()]);
  if (!set) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <ActiveLanguageSync language={set.language} active={activeLanguage} />
      <div className="flex flex-col gap-1">
        <Link href="/exercises" className="text-sm text-muted-foreground hover:text-foreground">
          ← All exercises
        </Link>
        <h1 className="text-2xl font-semibold">{set.item.name}</h1>
        <p className="text-sm text-muted-foreground">{set.item.explanation}</p>
      </div>
      <ExercisePlayer set={set} />
    </main>
  );
}
