"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createExercises } from "@/app/actions";
import { DEFAULT_EXERCISE_COUNT, EXERCISE_COUNTS } from "@/lib/exercises";
import { cn } from "@/lib/utils";

/** "Create exercises" for a grammar item: pick how many, generate, then open the new set. */
export function CreateExercises({
  grammarItemId,
  label = "Create exercises",
  initialCount = DEFAULT_EXERCISE_COUNT,
}: {
  grammarItemId: string;
  label?: string;
  initialCount?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const id = await createExercises(grammarItemId, count);
      router.push(`/exercises/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create exercises");
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border p-0.5" role="radiogroup" aria-label="Number of exercises">
          {EXERCISE_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === count}
              disabled={loading}
              onClick={() => setCount(n)}
              className={cn(
                "rounded-md px-2 py-0.5 text-sm text-muted-foreground hover:text-foreground",
                n === count && "bg-muted font-medium text-foreground"
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <Button size="sm" disabled={loading} onClick={handleCreate}>
          {loading ? "Generating…" : "Generate"}
        </Button>
        {!loading && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
