import { formatLemma, partOfSpeechLabel } from "./format-lemma";
import { findWord } from "./highlight";
import { getNativeLanguage } from "./languages";
import type { AnkiSettings, CardItem, LanguageCode } from "./types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\t\r\n]+/g, " ");
}

function sentenceHtml(item: CardItem): string {
  const match = findWord(item.exampleSentence, item.form);
  if (!match) return escapeHtml(item.exampleSentence);
  const [start, end] = match;
  const s = item.exampleSentence;
  return `${escapeHtml(s.slice(0, start))}<b>${escapeHtml(s.slice(start, end))}</b>${escapeHtml(s.slice(end))}`;
}

/** An example line in italics, with its translation under it if wanted and known. */
function exampleLine(html: string, translation: string | null, settings: AnkiSettings): string {
  const translated =
    settings.sentenceTranslation && translation ? `<br><small>${escapeHtml(translation)}</small>` : "";
  return `<i>${html}</i>${translated}`;
}

/** The example block as settings.exampleSource asks for it; empty when there is nothing to show. */
function exampleHtml(item: CardItem, translation: string | null, settings: AnkiSettings): string {
  const facts = item.facts;
  const short = facts?.shortExample
    ? exampleLine(escapeHtml(facts.shortExample), facts.shortExampleTranslation, settings)
    : null;
  const source = exampleLine(sentenceHtml(item), translation, settings);
  const lines = {
    short: [short],
    "short-then-source": [short ?? source],
    source: [source],
    both: [short, source],
  }[settings.exampleSource].filter((l) => l !== null);
  return lines.length > 0 ? `<br><br>${lines.join("<br><br>")}` : "";
}

const small = (text: string) => `<br><small>${escapeHtml(text)}</small>`;

/**
 * Builds the HTML of a card's two fields. With direction "both" the fields are learned/native
 * language and Anki's "Basic (and reversed card)" note type creates the reverse card.
 */
export function buildCard(
  language: LanguageCode,
  item: CardItem,
  settings: AnkiSettings,
  sentenceTranslation: string | null
): { front: string; back: string } {
  const facts = item.facts;
  const pos = settings.partOfSpeech && item.partOfSpeech
    ? small(partOfSpeechLabel(getNativeLanguage(), item.partOfSpeech))
    : "";

  const headword = escapeHtml(
    formatLemma(language, { ...item, forms: settings.forms ? facts?.forms : null })
  );
  const learned =
    headword + (settings.pattern && facts?.pattern ? small(facts.pattern) : "") + pos;
  const native =
    escapeHtml(item.translation) + pos + (settings.register && facts?.register ? small(facts.register) : "");

  const [front, back] =
    settings.direction === "native-learning" ? [native, learned] : [learned, native];

  const example = settings.example === "off" ? "" : exampleHtml(item, sentenceTranslation, settings);
  return settings.example === "front"
    ? { front: front + example, back }
    : { front, back: back + example };
}

/** Builds a tab-separated file for Anki's File → Import. */
export function buildAnkiFile(
  language: LanguageCode,
  items: CardItem[],
  settings: AnkiSettings,
  translationOf: (sentence: string) => string | null
): string {
  const notetype = settings.direction === "both" ? "Basic (and reversed card)" : "Basic";
  const header = ["#separator:tab", "#html:true", `#notetype:${notetype}`, "#columns:Front\tBack"];
  const rows = items.map((item) => {
    const { front, back } = buildCard(language, item, settings, translationOf(item.exampleSentence));
    return `${front}\t${back}`;
  });
  return [...header, ...rows].join("\n") + "\n";
}
