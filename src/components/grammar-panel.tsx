"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GrammarExampleLine, GrammarTags, sentenceHref } from "@/components/grammar-example";
import type { GrammarAnalysisState } from "@/components/grammar-selection";
import type { GrammarExplanation, IdentifiedConstruct } from "@/lib/types";

/** Examples of a saved item shown in the panel; the full list is on the grammar page. */
const MAX_SAVED_EXAMPLES = 4;

/** The grammar analysis of a selection, docked at the bottom of the screen. */
export function GrammarPanel({
  extractionId,
  state,
  choose,
  back,
  save,
  attach,
  close,
}: {
  extractionId: string;
  state: GrammarAnalysisState;
  choose: (construct: IdentifiedConstruct) => void;
  back: () => void;
  save: (construct: IdentifiedConstruct, explanation: GrammarExplanation) => void;
  attach: (itemId: string, construct: IdentifiedConstruct) => void;
  close: () => void;
}) {
  const { target, identification, step, error, busy, done } = state;
  const canGoBack = (identification?.constructs.length ?? 0) > 1 && step.kind !== "pick";

  return (
    <aside
      aria-label="Grammar analysis"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-h-[60vh] max-w-3xl flex-col gap-3 overflow-y-auto rounded-xl border bg-background p-4 shadow-lg"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {canGoBack && (
            <button onClick={back} className="mr-3 hover:text-foreground">
              ← All constructs
            </button>
          )}
          Grammar of <span className="italic text-foreground">“{target.span}”</span>
        </p>
        <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close">
          <X />
        </Button>
      </div>

      {step.kind === "identifying" && !error && (
        <p className="text-sm text-muted-foreground">Finding constructs…</p>
      )}

      {step.kind === "pick" && identification && (
        <ul className="flex flex-col gap-1">
          {identification.constructs.map((c, i) => (
            <li key={i}>
              <button
                onClick={() => choose(c)}
                disabled={busy}
                className="flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <GrammarTags level={c.level} category={c.category} />
                  {c.item && <Badge>saved</Badge>}
                </span>
                <span className="text-sm text-muted-foreground">
                  <span className="italic">{c.form}</span> · {c.gist}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {step.kind !== "identifying" && step.kind !== "pick" && (
        <ConstructHeader construct={step.construct} saved={step.kind === "existing"} />
      )}

      {step.kind === "explaining" && !error && (
        <p className="text-sm text-muted-foreground">Explaining…</p>
      )}

      {step.kind === "explained" && (
        <>
          <p className="text-sm">{step.explanation.explanation}</p>
          <ul className="flex flex-col gap-2 text-sm">
            <GrammarExampleLine
              sentence={target.sentenceText}
              form={step.construct.form}
              href={sentenceHref(extractionId, target.sentence)}
            />
            {step.explanation.examples.map((e, i) => (
              <GrammarExampleLine key={i} {...e} />
            ))}
          </ul>
          {!done && (
            <NewConstructActions
              savedItems={identification?.savedItems ?? []}
              busy={busy}
              onSave={() => save(step.construct, step.explanation)}
              onAttach={(itemId) => attach(itemId, step.construct)}
            />
          )}
        </>
      )}

      {step.kind === "existing" && step.construct.item && (
        <>
          <p className="text-sm">{step.construct.item.explanation}</p>
          <ul className="flex flex-col gap-2 text-sm">
            {step.construct.item.examples.slice(0, MAX_SAVED_EXAMPLES).map((e) => (
              <GrammarExampleLine
                key={e.id}
                sentence={e.sentence}
                form={e.form}
                translation={e.translation}
                href={
                  e.extractionId && e.sentenceIndex !== null
                    ? sentenceHref(e.extractionId, e.sentenceIndex)
                    : null
                }
              />
            ))}
          </ul>
          {!done && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => attach(step.construct.item!.id, step.construct)} disabled={busy}>
                {busy ? "Adding…" : "Add this sentence as example"}
              </Button>
            </div>
          )}
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {done && (
        <p className="text-right text-sm text-muted-foreground">
          {done}{" "}
          <Link href="/grammar" className="underline hover:text-foreground">
            Open grammar list
          </Link>
        </p>
      )}
    </aside>
  );
}

function ConstructHeader({ construct, saved }: { construct: IdentifiedConstruct; saved: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-lg font-semibold">{construct.name}</h2>
      <GrammarTags level={construct.level} category={construct.category} />
      {saved && <Badge>saved</Badge>}
    </div>
  );
}

/** Save as a new item, or attach the sentence to a saved item the LLM did not recognize. */
function NewConstructActions({
  savedItems,
  busy,
  onSave,
  onAttach,
}: {
  savedItems: { id: string; name: string }[];
  busy: boolean;
  onSave: () => void;
  onAttach: (itemId: string) => void;
}) {
  const [itemId, setItemId] = useState("");

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {savedItems.length > 0 && (
        <>
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            aria-label="Saved construct"
            className="h-7 max-w-64 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="">Same as…</option>
            {savedItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={busy || !itemId} onClick={() => onAttach(itemId)}>
            Add sentence there
          </Button>
        </>
      )}
      <Button size="sm" onClick={onSave} disabled={busy}>
        {busy ? "Saving…" : "Save to grammar list"}
      </Button>
    </div>
  );
}
