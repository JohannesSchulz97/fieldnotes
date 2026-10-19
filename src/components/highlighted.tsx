import { findWord } from "@/lib/highlight";

/** Bolds the first whole-word, case-insensitive match of part in text; plain text if not found. */
export function Highlighted({ text, part }: { text: string; part: string }) {
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
