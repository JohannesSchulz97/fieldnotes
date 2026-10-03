"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { extract, markItem } from "@/app/actions";
import type { ExtractedItem, ExtractionResult, WordStatus } from "@/lib/types";

export function Extractor() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function handleExtract() {
    setLoading(true);
    setError(null);
    try {
      const res = await extract(text);
      setResult(res);
      setItems(res.items);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  }

  async function mark(item: ExtractedItem, status: WordStatus) {
    if (!result) return;
    await markItem(item, result.sourceLanguage, result.targetLanguage, status);
    removeItem(item.lemma);
  }

  function removeItem(lemma: string) {
    setItems((prev) => prev.filter((i) => i.lemma !== lemma));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(lemma);
      return next;
    });
  }

  function toggle(lemma: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(lemma);
      else next.delete(lemma);
      return next;
    });
  }

  const allSelected = items.length > 0 && selected.size === items.length;

  return (
    <div className="flex flex-col gap-6">
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

      {result && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {result.stats.totalLemmas} lemmas · {result.stats.knownCount}{" "}
              known · {items.length} unknown
            </p>
            <Button variant="outline" disabled>
              Export {selected.size > 0 ? selected.size : ""} to Anki
            </Button>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No unknown words left.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={selected.size > 0 && !allSelected}
                      onCheckedChange={(checked) =>
                        setSelected(
                          checked ? new Set(items.map((i) => i.lemma)) : new Set()
                        )
                      }
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Lemma</TableHead>
                  <TableHead>Translation</TableHead>
                  <TableHead>Example</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.lemma}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(item.lemma)}
                        onCheckedChange={(checked) => toggle(item.lemma, checked)}
                        aria-label={`Select ${item.lemma}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.lemma}</span>
                        {item.kind === "expression" && (
                          <Badge variant="secondary">expr.</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[item.partOfSpeech, item.surfaceForms.join(", ")]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </TableCell>
                    <TableCell>{item.translation}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal text-sm italic text-muted-foreground">
                      {item.exampleSentence}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => mark(item, "known")}
                        >
                          Known
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => mark(item, "ignored")}
                        >
                          Ignore
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
