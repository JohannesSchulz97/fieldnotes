/**
 * Finds the first case-insensitive match of part in text that is not glued to letters
 * on either side ("le" must not match inside "elle"). Returns [start, end] or null.
 */
export function findWord(text: string, part: string): [number, number] | null {
  if (!part) return null;
  const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const before = /^\p{L}/u.test(part) ? "(?<!\\p{L})" : "";
  const after = /\p{L}$/u.test(part) ? "(?!\\p{L})" : "";
  const m = new RegExp(before + escaped + after, "iu").exec(text);
  return m ? [m.index, m.index + m[0].length] : null;
}
