/**
 * Splits text into paragraphs (separated by blank lines) of trimmed sentences.
 * Used by extraction, translation and the reading view so sentence numbers line up everywhere.
 */
export function splitParagraphs(text: string): string[][] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
  return text
    .split(/\n\s*\n/)
    .map((p) => [...segmenter.segment(p)].map((s) => s.segment.trim()).filter(Boolean))
    .filter((p) => p.length > 0);
}

export function splitSentences(text: string): string[] {
  return splitParagraphs(text).flat();
}
