"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { glossExtraction, translateExtraction } from "@/app/actions";

/** Translates a text, or, with glossOnly, adds word glosses to its existing translation. */
export function TranslateButton({ id, glossOnly = false }: { id: string; glossOnly?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      await (glossOnly ? glossExtraction(id) : translateExtraction(id));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : glossOnly ? "Glossing failed" : "Translation failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-destructive">{error}</span>}
      <Button variant="outline" size="sm" onClick={handleClick} disabled={pending}>
        {pending ? (glossOnly ? "Adding glosses…" : "Translating…") : glossOnly ? "Add word glosses" : "Translate"}
      </Button>
    </div>
  );
}
