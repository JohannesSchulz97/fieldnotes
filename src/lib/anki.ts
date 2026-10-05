import { findWord } from "./highlight";
import type { AnkiSettings, ExtractedItem } from "./types";

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

function exampleHtml(item: ExtractedItem, translation: string | null, settings: AnkiSettings): string {
  const english =
    settings.sentenceTranslation && translation ? `<br><small>${escapeHtml(translation)}</small>` : "";
  return `<br><br><i>${sentenceHtml(item)}</i>${english}`;
}

/**
 * Builds the HTML of a card's two fields. With direction "both" the fields are French/English
 * and Anki's "Basic (and reversed card)" note type creates the reverse card.
 */
export function buildCard(
  item: ExtractedItem,
  settings: AnkiSettings,
  sentenceTranslation: string | null
): { front: string; back: string } {
  const french = escapeHtml(item.lemma);
  const english = escapeHtml(item.translation);
  const [front, answer] = settings.direction === "en-fr" ? [english, french] : [french, english];
  const back =
    settings.partOfSpeech && item.partOfSpeech
      ? `${answer}<br><small>${escapeHtml(item.partOfSpeech)}</small>`
      : answer;

  const example = settings.example === "off" ? "" : exampleHtml(item, sentenceTranslation, settings);
  return settings.example === "front"
    ? { front: front + example, back }
    : { front, back: back + example };
}

/** Builds a tab-separated file for Anki's File → Import. */
export function buildAnkiFile(
  items: ExtractedItem[],
  settings: AnkiSettings,
  translationOf: (sentence: string) => string | null
): string {
  const notetype = settings.direction === "both" ? "Basic (and reversed card)" : "Basic";
  const header = ["#separator:tab", "#html:true", `#notetype:${notetype}`, "#columns:Front\tBack"];
  const rows = items.map((item) => {
    const { front, back } = buildCard(item, settings, translationOf(item.exampleSentence));
    return `${front}\t${back}`;
  });
  return [...header, ...rows].join("\n") + "\n";
}
