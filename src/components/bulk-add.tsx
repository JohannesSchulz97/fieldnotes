"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addKnownWords } from "@/app/actions";

export function BulkAdd() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await addKnownWords(text);
      setMessage(
        `${res.added} added · ${res.alreadyStored} already in list` +
          (res.skippedLines > 0 ? ` · ${res.skippedLines} lines skipped` : "")
      );
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Adding failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Add known words</h2>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"One word or expression per line, any form:\nquai\nassise\nse rendre compte"}
        className="min-h-32"
      />
      <div className="flex items-center gap-3">
        <Button onClick={handleAdd} disabled={loading || text.trim() === ""}>
          {loading ? "Adding…" : "Add as known"}
        </Button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </section>
  );
}
