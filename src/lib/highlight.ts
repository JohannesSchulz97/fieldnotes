/** Matches part case-insensitively where it is not glued to letters on either side ("le" not in "elle"). */
function wordPattern(part: string, flags: string): RegExp {
  const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const before = /^\p{L}/u.test(part) ? "(?<!\\p{L})" : "";
  const after = /\p{L}$/u.test(part) ? "(?!\\p{L})" : "";
  return new RegExp(before + escaped + after, flags);
}

/**
 * Finds the first case-insensitive match of part in text that is not glued to letters
 * on either side ("le" must not match inside "elle"). Returns [start, end] or null.
 */
export function findWord(text: string, part: string): [number, number] | null {
  if (!part) return null;
  const m = wordPattern(part, "iu").exec(text);
  return m ? [m.index, m.index + m[0].length] : null;
}

/**
 * All whole-word, case-insensitive matches of any of parts in text, sorted by position.
 * Where matches overlap, the one starting first wins, then the longer one.
 */
export function findWords(text: string, parts: string[]): [number, number][] {
  const matches: [number, number][] = [];
  for (const part of new Set(parts.filter(Boolean))) {
    for (const m of text.matchAll(wordPattern(part, "giu"))) {
      matches.push([m.index, m.index + m[0].length]);
    }
  }
  matches.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const kept: [number, number][] = [];
  for (const m of matches) {
    if (kept.length === 0 || m[0] >= kept[kept.length - 1][1]) kept.push(m);
  }
  return kept;
}
