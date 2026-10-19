"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateSource } from "@/app/actions";
import { linkHost } from "@/lib/source";

/** The title and link of a source, with inline editing. */
export function SourceDetails({
  id,
  title,
  sourceUrl,
  fallbackTitle,
}: {
  id: string;
  title: string | null;
  sourceUrl: string | null;
  /** Shown as the heading while the source has no title. */
  fallbackTitle: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title ?? "");
  const [draftLink, setDraftLink] = useState(sourceUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraftTitle(title ?? "");
    setDraftLink(sourceUrl ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateSource(id, draftTitle, draftLink);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving failed");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Title" aria-label="Title" />
        <Input
          value={draftLink}
          onChange={(e) => setDraftLink(e.target.value)}
          placeholder="Link to the source"
          aria-label="Link"
          inputMode="url"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold">{title ?? fallbackTitle}</h1>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
            {linkHost(sourceUrl)} ↗
          </a>
        )}
        <button onClick={startEditing} className="hover:text-foreground">
          {title || sourceUrl ? "Edit" : "Add title or link"}
        </button>
      </div>
    </div>
  );
}
