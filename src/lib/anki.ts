import { findWord } from "./highlight";
import type { ExtractedItem } from "./types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\t\r\n]+/g, " ");
}

function sentenceHtml(item: ExtractedItem): string {
  const match = findWord(item.exampleSentence, item.form);
  if (!match) return escapeHtml(item.exampleSentence);
  const [start, end] = match;
  const s = item.exampleSentence;
  return `${escapeHtml(s.slice(0, start))}<b>${escapeHtml(s.slice(start, end))}</b>${escapeHtml(s.slice(end))}`;
}

/**
 * Builds a tab-separated file for Anki's File → Import (Basic note type).
 * Front: lemma + example sentence with the word in bold. Back: translation + part of speech.
 */
export function buildAnkiFile(items: ExtractedItem[]): string {
  const header = ["#separator:tab", "#html:true", "#notetype:Basic", "#columns:Front\tBack"];
  const rows = items.map((item) => {
    const front = `${escapeHtml(item.lemma)}<br><br><i>${sentenceHtml(item)}</i>`;
    const back = item.partOfSpeech
      ? `${escapeHtml(item.translation)}<br><small>${escapeHtml(item.partOfSpeech)}</small>`
      : escapeHtml(item.translation);
    return `${front}\t${back}`;
  });
  return [...header, ...rows].join("\n") + "\n";
}
