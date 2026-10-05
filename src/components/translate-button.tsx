"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { translateExtraction } from "@/app/actions";

export function TranslateButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      await translateExtraction(id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-destructive">{error}</span>}
      <Button variant="outline" size="sm" onClick={handleClick} disabled={pending}>
        {pending ? "Translating…" : "Translate"}
      </Button>
    </div>
  );
}
