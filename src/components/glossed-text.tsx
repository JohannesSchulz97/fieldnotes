"use client";

import { Fragment, type ReactNode } from "react";
import { findWords } from "@/lib/highlight";
import { tokenizeSentence, type Gloss } from "@/lib/tokens";

/** What the reading view needs to show a tooltip for a hovered group. */
export interface GlossHover {
  gloss: string;
  rect: DOMRect;
}

/**
 * A sentence with its new words in bold and, where glosses exist, each group of words wrapped so
 * hovering any word of it highlights the whole group and reports its gloss. Wrapped groups also
 * carry data-gloss, which the selection chip reads for a selection inside one group.
 */
export function GlossedText({
  text,
  forms,
  glosses,
  onHover,
}: {
  text: string;
  /** How the new words appear in the text; shown in bold wherever they occur. */
  forms: string[];
  glosses?: Gloss[];
  onHover?: (hover: GlossHover | null) => void;
}) {
  const tokens = tokenizeSentence(text);
  const groups = (glosses ?? [])
    .filter((g) => g.to < tokens.length)
    .map((g) => ({ start: tokens[g.from].start, end: tokens[g.to].end, gloss: g.gloss }));
  const bold = findWords(text, forms);

  // Cut the text wherever a group or a bold range starts or ends, so each piece is uniform.
  const cuts = [
    ...new Set([0, text.length, ...groups.flatMap((g) => [g.start, g.end]), ...bold.flat()]),
  ].sort((a, b) => a - b);

  const pieces = cuts.slice(0, -1).map((start, i) => {
    const end = cuts[i + 1];
    return {
      key: start,
      group: groups.findIndex((g) => g.start <= start && end <= g.end),
      node: bold.some(([s, e]) => s <= start && end <= e) ? (
        <strong key={start} className="font-semibold">
          {text.slice(start, end)}
        </strong>
      ) : (
        text.slice(start, end)
      ),
    };
  });

  // Consecutive pieces of one group share one wrapper.
  const nodes: ReactNode[] = [];
  for (let i = 0; i < pieces.length; ) {
    const { group } = pieces[i];
    let j = i;
    while (j < pieces.length && pieces[j].group === group) j++;
    const run = pieces.slice(i, j).map((p) => <Fragment key={p.key}>{p.node}</Fragment>);
    if (group < 0) {
      nodes.push(...run);
    } else {
      const { gloss } = groups[group];
      nodes.push(
        <span
          key={pieces[i].key}
          data-gloss={gloss}
          className="underline-offset-4 decoration-muted-foreground/60 decoration-dotted hover:underline"
          onPointerEnter={(e) => {
            // Only a mouse that is not dragging a selection; touch has no hover.
            if (e.pointerType !== "mouse" || e.buttons !== 0) return;
            onHover?.({ gloss, rect: e.currentTarget.getBoundingClientRect() });
          }}
          onPointerLeave={() => onHover?.(null)}
        >
          {run}
        </span>
      );
    }
    i = j;
  }
  return nodes;
}
