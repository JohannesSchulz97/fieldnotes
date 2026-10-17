"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { extract } from "@/app/actions";

export function ExtractForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExtract() {
    setLoading(true);
    setError(null);
    try {
      const { id } = await extract(text);
      router.push(`/extractions/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a French text…"
        className="min-h-48"
      />
      <Button
        onClick={handleExtract}
        disabled={loading || text.trim() === ""}
        className="self-start"
      >
        {loading ? "Extracting…" : "Extract vocabulary"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
