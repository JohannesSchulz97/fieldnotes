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
import { extract, markExported, markItem, unmarkItem } from "@/app/actions";
import { buildAnkiFile } from "@/lib/anki";
import { findWord } from "@/lib/highlight";
import type { ExtractedItem, ExtractionResult, WordStatus } from "@/lib/types";

export function Extractor() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [knownItems, setKnownItems] = useState<ExtractedItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  async function handleExtract() {
    setLoading(true);
    setError(null);
    try {
      const res = await extract(text);
      setResult(res);
      setItems(res.items);
      setKnownItems(res.knownItems);
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
    if (status === "known") setKnownItems((prev) => [item, ...prev]);
  }

  async function unmark(item: ExtractedItem) {
    if (!result) return;
    await unmarkItem(result.sourceLanguage, item.lemma);
    setKnownItems((prev) => prev.filter((i) => i.lemma !== item.lemma));
    setItems((prev) => [...prev, item]);
  }

  async function handleExport() {
    if (!result) return;
    const toExport = items.filter((i) => selected.has(i.lemma));
    setExporting(true);
    setError(null);
    try {
      await markExported(toExport, result.sourceLanguage, result.targetLanguage);
      download(
        buildAnkiFile(toExport),
        `anki-${result.sourceLanguage}-${new Date().toISOString().slice(0, 10)}.txt`
      );
      setItems((prev) => prev.filter((i) => !selected.has(i.lemma)));
      setKnownItems((prev) => [...toExport, ...prev]);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
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
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              New words{" "}
              <span className="font-normal text-muted-foreground">
                {items.length}
              </span>
            </h2>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting || selected.size === 0}
            >
              {exporting
                ? "Exporting…"
                : `Export ${selected.size > 0 ? selected.size : ""} to Anki`}
            </Button>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No new words left.
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
                    <LemmaCell item={item} />
                    <TableCell>{item.translation}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal text-sm italic text-muted-foreground">
                      <Highlighted text={item.exampleSentence} part={item.form} />
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
        </section>
      )}

      {result && knownItems.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            Known words{" "}
            <span className="font-normal text-muted-foreground">
              {knownItems.length}
            </span>
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lemma</TableHead>
                <TableHead>Translation</TableHead>
                <TableHead>Example</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {knownItems.map((item) => (
                <TableRow key={item.lemma} className="text-muted-foreground">
                  <LemmaCell item={item} />
                  <TableCell>{item.translation}</TableCell>
                  <TableCell className="max-w-xs whitespace-normal text-sm italic">
                    <Highlighted text={item.exampleSentence} part={item.form} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => unmark(item)}>
                      Mark as new
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}

function LemmaCell({ item }: { item: ExtractedItem }) {
  return (
    <TableCell>
      <div className="flex items-center gap-2">
        <span className="font-medium">{item.lemma}</span>
        {item.kind === "expression" && <Badge variant="secondary">expr.</Badge>}
      </div>
      <div className="text-xs text-muted-foreground">
        {item.partOfSpeech}
      </div>
    </TableCell>
  );
}

/** Bolds the first whole-word, case-insensitive match of part in text; plain text if not found. */
function Highlighted({ text, part }: { text: string; part: string }) {
  const match = part ? findWord(text, part) : null;
  if (!match) return text;
  const [start, end] = match;
  return (
    <>
      {text.slice(0, start)}
      <strong className="font-semibold not-italic text-foreground">
        {text.slice(start, end)}
      </strong>
      {text.slice(end)}
    </>
  );
}


function download(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
