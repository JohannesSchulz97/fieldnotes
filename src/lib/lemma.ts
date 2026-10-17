/** Canonical lemma spelling: typographic apostrophes (’ ‘ ʼ) become ', so "l’an" matches "l'an". */
export function normalizeLemma(lemma: string): string {
  return lemma.replace(/[’‘ʼ]/g, "'").trim();
}
