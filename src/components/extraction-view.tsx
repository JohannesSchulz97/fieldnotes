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
import { markExported, markItem, unmarkItem, updateAnkiSettings } from "@/app/actions";
import { AnkiSettingsPanel } from "@/components/anki-settings-panel";
import { Highlighted } from "@/components/highlighted";
import { buildAnkiFile } from "@/lib/anki";
import { formatLemma } from "@/lib/format-lemma";
import type {
  AnkiSettings,
  ExtractedItem,
  ExtractionResult,
  LearnedItem,
  WordStatus,
} from "@/lib/types";

type Selection = Set<string>;

function withToggled(selection: Selection, lemma: string, checked: boolean): Selection {
  const next = new Set(selection);
  if (checked) next.add(lemma);
  else next.delete(lemma);
  return next;
}

/**
 * Words of a saved extraction in three groups: new, learned from this text (exported to Anki),
 * and already known (known before, or marked known). Marking and exporting persist immediately.
 */
export function ExtractionView({
  result,
  ankiSettings: initialAnkiSettings,
}: {
  result: ExtractionResult;
  ankiSettings: AnkiSettings;
}) {
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState(result.items);
  const [learned, setLearned] = useState(result.learnedItems);
  const [known, setKnown] = useState(result.knownItems);
  const [selectedNew, setSelectedNew] = useState<Selection>(new Set());
  const [selectedLearned, setSelectedLearned] = useState<Selection>(new Set());
  const [exporting, setExporting] = useState<"new" | "learned" | null>(null);
  const [ankiSettings, setAnkiSettings] = useState(initialAnkiSettings);
  const [showSettings, setShowSettings] = useState(false);

  // English for each example sentence, once the text has been translated.
  const sentences = result.paragraphs.flat();
  const translationOf = (sentence: string) =>
    result.translations?.[sentences.indexOf(sentence)] || null;

  // Preview the first selected word, else the first word that could be exported.
  const previewItem =
    items.find((i) => selectedNew.has(i.lemma)) ??
    learned.find((i) => selectedLearned.has(i.lemma)) ??
    items[0] ??
    learned[0];

  function changeAnkiSettings(next: AnkiSettings) {
    setAnkiSettings(next);
    updateAnkiSettings(next).catch(() => setError("Could not save export settings"));
  }

  async function mark(item: ExtractedItem, status: WordStatus) {
    await markItem(item, result.sourceLanguage, result.targetLanguage, status);
    setItems((prev) => prev.filter((i) => i.lemma !== item.lemma));
    setSelectedNew((prev) => withToggled(prev, item.lemma, false));
    if (status === "known") setKnown((prev) => [item, ...prev]);
  }

  async function unmark(item: ExtractedItem) {
    await unmarkItem(result.sourceLanguage, item.lemma);
    setLearned((prev) => prev.filter((i) => i.lemma !== item.lemma));
    setKnown((prev) => prev.filter((i) => i.lemma !== item.lemma));
    setSelectedLearned((prev) => withToggled(prev, item.lemma, false));
    setItems((prev) => [...prev, item]);
  }

  async function exportSelected(from: "new" | "learned") {
    const toExport: ExtractedItem[] =
      from === "new"
        ? items.filter((i) => selectedNew.has(i.lemma))
        : learned.filter((i) => selectedLearned.has(i.lemma));
    const lemmas = new Set(toExport.map((i) => i.lemma));
    setExporting(from);
    setError(null);
    try {
      await markExported(toExport, result.sourceLanguage, result.targetLanguage);
      download(
        buildAnkiFile(result.sourceLanguage, toExport, ankiSettings, translationOf),
        `anki-${result.sourceLanguage}-${new Date().toISOString().slice(0, 10)}.txt`
      );
      const exportedAt = new Date().toISOString();
      const exported: LearnedItem[] = toExport.map((i) => ({ ...i, exportedAt }));
      if (from === "new") {
        setItems((prev) => prev.filter((i) => !lemmas.has(i.lemma)));
        setLearned((prev) => [...exported, ...prev]);
        setSelectedNew(new Set());
      } else {
        setLearned((prev) => prev.map((i) => (lemmas.has(i.lemma) ? { ...i, exportedAt } : i)));
        setSelectedLearned(new Set());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  const exampleCell = (item: ExtractedItem) => (
    <TableCell className="max-w-xs whitespace-normal text-sm italic text-muted-foreground">
      <Example
        item={item}
        sentence={sentences.indexOf(item.exampleSentence)}
        translation={translationOf(item.exampleSentence)}
      />
    </TableCell>
  );

  return (
    <div className="flex flex-col gap-8">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SectionTitle title="New words" count={items.length} />
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowSettings((v) => !v)}
              aria-expanded={showSettings}
            >
              Export settings
            </Button>
            <Button
              variant="outline"
              onClick={() => exportSelected("new")}
              disabled={exporting !== null || selectedNew.size === 0}
            >
              {exporting === "new"
                ? "Exporting…"
                : `Export ${selectedNew.size > 0 ? selectedNew.size : ""} to Anki`}
            </Button>
          </div>
        </div>

        {showSettings && (
          <AnkiSettingsPanel
            settings={ankiSettings}
            onChange={changeAnkiSettings}
            language={result.sourceLanguage}
            previewItem={previewItem}
            previewTranslation={previewItem ? translationOf(previewItem.exampleSentence) : null}
          />
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No new words left.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <SelectAll items={items} selected={selectedNew} onChange={setSelectedNew} />
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
                      checked={selectedNew.has(item.lemma)}
                      onCheckedChange={(checked) =>
                        setSelectedNew((prev) => withToggled(prev, item.lemma, checked))
                      }
                      aria-label={`Select ${item.lemma}`}
                    />
                  </TableCell>
                  <LemmaCell item={item} language={result.sourceLanguage} />
                  <TableCell>
                    {item.translation}
                    {item.contextNote && (
                      <span className="block text-xs text-muted-foreground">In text: {item.contextNote}</span>
                    )}
                  </TableCell>
                  {exampleCell(item)}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => mark(item, "known")}>
                        Known
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => mark(item, "ignored")}>
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

      {learned.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <SectionTitle title="Exported" count={learned.length} />
            <Button
              variant="outline"
              onClick={() => exportSelected("learned")}
              disabled={exporting !== null || selectedLearned.size === 0}
            >
              {exporting === "learned"
                ? "Exporting…"
                : `Export ${selectedLearned.size > 0 ? selectedLearned.size : ""} again`}
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <SelectAll
                    items={learned}
                    selected={selectedLearned}
                    onChange={setSelectedLearned}
                  />
                </TableHead>
                <TableHead>Lemma</TableHead>
                <TableHead>Translation</TableHead>
                <TableHead>Example</TableHead>
                <TableHead>Exported</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {learned.map((item) => (
                <TableRow key={item.lemma}>
                  <TableCell>
                    <Checkbox
                      checked={selectedLearned.has(item.lemma)}
                      onCheckedChange={(checked) =>
                        setSelectedLearned((prev) => withToggled(prev, item.lemma, checked))
                      }
                      aria-label={`Select ${item.lemma}`}
                    />
                  </TableCell>
                  <LemmaCell item={item} language={result.sourceLanguage} />
                  <TableCell>{item.translation}</TableCell>
                  {exampleCell(item)}
                  <TableCell className="text-sm text-muted-foreground">
                    {item.exportedAt.slice(0, 10)}
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

      {known.length > 0 && (
        <details className="group flex flex-col gap-3">
          <summary className="cursor-pointer list-none">
            <span className="mr-2 inline-block text-muted-foreground transition-transform group-open:rotate-90">
              ▸
            </span>
            <SectionTitle title="Already known" count={known.length} inline />
          </summary>
          <Table className="mt-3">
            <TableHeader>
              <TableRow>
                <TableHead>Lemma</TableHead>
                <TableHead>Translation</TableHead>
                <TableHead>Example</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {known.map((item) => (
                <TableRow key={item.lemma} className="text-muted-foreground">
                  <LemmaCell item={item} language={result.sourceLanguage} />
                  <TableCell>{item.translation}</TableCell>
                  {exampleCell(item)}
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => unmark(item)}>
                      Mark as new
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </details>
      )}
    </div>
  );
}

function SectionTitle({ title, count, inline }: { title: string; count: number; inline?: boolean }) {
  const Tag = inline ? "span" : "h2";
  return (
    <Tag className="text-lg font-semibold">
      {title} <span className="font-normal text-muted-foreground">{count}</span>
    </Tag>
  );
}

function SelectAll({
  items,
  selected,
  onChange,
}: {
  items: ExtractedItem[];
  selected: Selection;
  onChange: (selection: Selection) => void;
}) {
  const all = items.length > 0 && selected.size === items.length;
  return (
    <Checkbox
      checked={all}
      indeterminate={selected.size > 0 && !all}
      onCheckedChange={(checked) => onChange(checked ? new Set(items.map((i) => i.lemma)) : new Set())}
      aria-label="Select all"
    />
  );
}

function LemmaCell({ item, language }: { item: ExtractedItem; language: string }) {
  return (
    <TableCell>
      <div className="flex items-center gap-2">
        <span className="font-medium">{formatLemma(language, item)}</span>
        {item.kind === "expression" && <Badge variant="secondary">expr.</Badge>}
      </div>
      <div className="text-xs text-muted-foreground">{item.partOfSpeech}</div>
    </TableCell>
  );
}

/** sentence is the example's number in the text (-1 if not found); it makes the example selectable for grammar analysis. */
function Example({
  item,
  sentence,
  translation,
}: {
  item: ExtractedItem;
  sentence: number;
  translation: string | null;
}) {
  return (
    <>
      <span data-sentence={sentence >= 0 ? sentence : undefined}>
        <Highlighted text={item.exampleSentence} part={item.form} />
      </span>
      {translation && <div className="mt-1 text-xs not-italic">{translation}</div>}
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
