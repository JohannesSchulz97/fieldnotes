"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { GrammarPanel } from "@/components/grammar-panel";
import { addGrammarExample, explainGrammar, identifyGrammar, saveGrammarItem } from "@/app/actions";
import type { GrammarExplanation, GrammarIdentification, IdentifiedConstruct } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Words selected within one sentence of the extraction's text. */
export interface GrammarTarget {
  /** Sentence number as in splitSentences. */
  sentence: number;
  /** The full sentence, for showing it as an example. */
  sentenceText: string;
  span: string;
}

export type GrammarStep =
  | { kind: "identifying" }
  | { kind: "pick" }
  | { kind: "explaining"; construct: IdentifiedConstruct }
  | { kind: "explained"; construct: IdentifiedConstruct; explanation: GrammarExplanation }
  | { kind: "existing"; construct: IdentifiedConstruct };

export interface GrammarAnalysisState {
  target: GrammarTarget;
  identification: GrammarIdentification | null;
  step: GrammarStep;
  error: string | null;
  busy: boolean;
  /** Confirmation after saving or adding an example; the step's actions are done. */
  done: string | null;
}

/**
 * Elements with data-sentence={n} inside the children are selectable for grammar analysis, unless
 * inside a [data-grammar-off] element. Selecting words within one of them shows an analyse button;
 * the analysis opens in a panel docked at the bottom.
 */
export function GrammarSelection({
  extractionId,
  className,
  children,
}: {
  extractionId: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<
    (GrammarTarget & { top: number; left: number; gloss: string | null }) | null
  >(null);
  const [state, setState] = useState<GrammarAnalysisState | null>(null);
  // Increments per analysis, so late responses for an earlier selection are dropped.
  const requestRef = useRef(0);

  useEffect(() => {
    function onSelectionChange() {
      const sel = document.getSelection();
      const root = ref.current;
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !root) return setSelection(null);
      const el = sentenceElement(sel.anchorNode);
      const span = sel.toString().trim();
      if (!el || el !== sentenceElement(sel.focusNode) || !root.contains(el) || !span) {
        return setSelection(null);
      }
      const range = sel.getRangeAt(0);
      // A selection inside one glossed group (a tapped-and-held word on a phone) shows that gloss.
      const group = glossElement(range.startContainer);
      const gloss = group && group === glossElement(range.endContainer) ? group.dataset.gloss ?? null : null;
      const rect = range.getBoundingClientRect();
      const box = root.getBoundingClientRect();
      setSelection({
        sentence: Number(el.dataset.sentence),
        sentenceText: el.textContent ?? "",
        span,
        gloss,
        top: rect.bottom - box.top + 6,
        left: rect.left - box.left + rect.width / 2,
      });
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  /** Updates the state if it still belongs to the given request. */
  function update(request: number, change: (prev: GrammarAnalysisState) => GrammarAnalysisState) {
    setState((prev) => (prev && requestRef.current === request ? change(prev) : prev));
  }

  async function run(request: number, work: () => Promise<void>) {
    update(request, (s) => ({ ...s, busy: true, error: null }));
    try {
      await work();
    } catch (e) {
      update(request, (s) => ({ ...s, error: e instanceof Error ? e.message : "Something went wrong" }));
    } finally {
      update(request, (s) => ({ ...s, busy: false }));
    }
  }

  async function start({ sentence, sentenceText, span }: GrammarTarget) {
    const request = ++requestRef.current;
    const target = { sentence, sentenceText, span };
    setState({ target, identification: null, step: { kind: "identifying" }, error: null, busy: false, done: null });
    document.getSelection()?.removeAllRanges();
    await run(request, async () => {
      const identification = await identifyGrammar(extractionId, sentence, span);
      if (identification.constructs.length === 0) {
        throw new Error("No grammatical construct found in the selection.");
      }
      update(request, (s) => ({ ...s, identification, step: { kind: "pick" } }));
      if (identification.constructs.length === 1) {
        await choose(request, target, identification.constructs[0]);
      }
    });
  }

  async function choose(request: number, target: GrammarTarget, construct: IdentifiedConstruct) {
    if (construct.item) {
      update(request, (s) => ({ ...s, step: { kind: "existing", construct }, done: null }));
      return;
    }
    update(request, (s) => ({ ...s, step: { kind: "explaining", construct }, done: null }));
    const explanation = await explainGrammar(extractionId, target.sentence, target.span, construct);
    update(request, (s) => ({ ...s, step: { kind: "explained", construct, explanation } }));
  }

  const request = requestRef.current;
  const actions = state && {
    choose: (construct: IdentifiedConstruct) =>
      run(request, () => choose(request, state.target, construct)),
    back: () => update(request, (s) => ({ ...s, step: { kind: "pick" }, error: null, done: null })),
    save: (construct: IdentifiedConstruct, explanation: GrammarExplanation) =>
      run(request, async () => {
        const { sentence, span } = state.target;
        await saveGrammarItem(extractionId, sentence, span, construct, explanation);
        update(request, (s) => ({ ...s, done: "Saved to your grammar list." }));
      }),
    attach: (itemId: string, construct: IdentifiedConstruct) =>
      run(request, async () => {
        const { sentence, span } = state.target;
        await addGrammarExample(itemId, extractionId, sentence, span, construct.form);
        const name = state.identification?.savedItems.find((i) => i.id === itemId)?.name;
        update(request, (s) => ({ ...s, done: `Sentence added to “${name ?? "item"}”.` }));
      }),
    close: () => {
      requestRef.current++;
      setState(null);
    },
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      {children}
      {selection && (
        <div
          className="absolute z-10 flex -translate-x-1/2 flex-col items-center gap-1"
          style={{ top: selection.top, left: selection.left }}
        >
          {selection.gloss && (
            <span className="rounded-md border bg-popover px-2 py-1 text-sm text-popover-foreground shadow-md">
              {selection.gloss}
            </span>
          )}
          <Button
            size="sm"
            className="shadow-md"
            // Keep the text selected while pressing the button.
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => start(selection)}
          >
            Analyse grammar
          </Button>
        </div>
      )}
      {state && actions && <GrammarPanel extractionId={extractionId} state={state} {...actions} />}
    </div>
  );
}

/** The glossed group (data-gloss) containing node, if any. */
function glossElement(node: Node | null): HTMLElement | null {
  const el = node instanceof Element ? node : node?.parentElement;
  return el?.closest<HTMLElement>("[data-gloss]") ?? null;
}

/** The selectable sentence element containing node, if any. */
function sentenceElement(node: Node | null): HTMLElement | null {
  const el = node instanceof Element ? node : node?.parentElement;
  const sentence = el?.closest<HTMLElement>("[data-sentence]");
  return sentence && !sentence.closest("[data-grammar-off]") ? sentence : null;
}
