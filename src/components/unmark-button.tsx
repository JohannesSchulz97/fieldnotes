"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { unmarkItem } from "@/app/actions";

export function UnmarkButton({ language, lemma }: { language: string; lemma: string }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await unmarkItem(language, lemma);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={handleClick} disabled={pending}>
      Mark as new
    </Button>
  );
}
