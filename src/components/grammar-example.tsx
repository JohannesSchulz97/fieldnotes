import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Highlighted } from "@/components/highlighted";
import { categoryLabel } from "@/lib/grammar";
import type { CefrLevel, GrammarCategory } from "@/lib/types";

/** Link to a sentence in the reading view of an extraction. */
export function sentenceHref(extractionId: string, sentenceIndex: number): string {
  return `/extractions/${extractionId}?sentence=${sentenceIndex}`;
}

/** One example sentence with the construct in bold, its translation, and a link to its text. */
export function GrammarExampleLine({
  sentence,
  form,
  translation,
  href,
}: {
  sentence: string;
  form: string;
  translation?: string | null;
  /** Set for sentences from the learner's texts. */
  href?: string | null;
}) {
  return (
    <li>
      <div className="italic text-muted-foreground">
        <Highlighted text={sentence} part={form} />
        {href && (
          <Link
            href={href}
            title="Open in text"
            aria-label="Open in text"
            className="ml-1 inline-flex align-middle text-muted-foreground not-italic hover:text-foreground"
          >
            <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>
      {translation && <div className="text-xs text-muted-foreground">{translation}</div>}
    </li>
  );
}

/** Level and category of a construct, as small badges. */
export function GrammarTags({ level, category }: { level: CefrLevel; category: GrammarCategory }) {
  return (
    <span className="inline-flex gap-1.5">
      <Badge variant="outline" title="Estimated CEFR level">
        ≈{level}
      </Badge>
      <Badge variant="secondary">{categoryLabel(category)}</Badge>
    </span>
  );
}
