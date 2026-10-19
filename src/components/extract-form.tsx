"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { extract, type ExtractOutcome } from "@/app/actions";

export function ExtractForm({ languageName }: { languageName: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<Extract<ExtractOutcome, { status: "mismatch" }> | null>(null);

  async function handleExtract(force = false) {
    setLoading(true);
    setError(null);
    setMismatch(null);
    try {
      const outcome = await extract(text, title, link, force);
      if (outcome.status === "mismatch") {
        setMismatch(outcome);
        setLoading(false);
        return;
      }
      router.push(`/extractions/${outcome.id}`);
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
        placeholder={`Paste a text in ${languageName}…`}
        className="min-h-48"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          aria-label="Title"
        />
        <Input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Link to the source (optional)"
          aria-label="Link"
          inputMode="url"
        />
      </div>
      <Button
        onClick={() => handleExtract()}
        disabled={loading || text.trim() === ""}
        className="self-start"
      >
        {loading ? "Extracting…" : "Extract vocabulary"}
      </Button>
      {mismatch && (
        <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <p>
            This text looks like {mismatch.detectedName}, but {mismatch.activeName} is selected.
            Extracting it as {mismatch.activeName} would fill your {mismatch.activeName} vocabulary
            with the wrong words.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExtract(true)}>
              Extract as {mismatch.activeName} anyway
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMismatch(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
