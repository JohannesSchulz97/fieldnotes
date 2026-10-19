"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteGrammarItem, setGrammarStatus } from "@/app/actions";
import type { GrammarStatus } from "@/lib/types";

export function GrammarItemActions({ id, status }: { id: string; status: GrammarStatus }) {
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<void>) {
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex shrink-0 gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          run(() => setGrammarStatus(id, status === "learned" ? "to_work_on" : "learned"))
        }
      >
        {status === "learned" ? "Work on again" : "Mark learned"}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteGrammarItem(id))}>
        Delete
      </Button>
    </div>
  );
}
