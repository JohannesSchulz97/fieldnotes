"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { extract } from "@/app/actions";

export function ExtractForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExtract() {
    setLoading(true);
    setError(null);
    try {
      const { id } = await extract(text, title, link);
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
