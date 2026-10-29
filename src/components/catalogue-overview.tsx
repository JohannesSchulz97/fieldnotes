"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GrammarExampleLine, GrammarTags } from "@/components/grammar-example";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addCatalogConstruct } from "@/app/actions";
import { CEFR_LEVELS, GRAMMAR_CATEGORIES } from "@/lib/grammar";
import type { CatalogConstruct } from "@/lib/grammar-catalog/schema";
import type { GrammarStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tracked = Record<string, { itemId: string; status: GrammarStatus }>;
type Filter = "all" | "tracked" | "untracked";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "tracked", label: "Tracked" },
  { value: "untracked", label: "Not tracked" },
];

const STATUS_LABEL: Record<GrammarStatus, string> = { to_work_on: "to work on", learned: "learned" };

/** Chip style per tracking state; the same styles make up the legend. */
function chipClass(status: GrammarStatus | undefined): string {
  if (status === "learned") return "border-foreground bg-foreground text-background";
  if (status === "to_work_on") return "border-foreground/60 bg-muted font-medium text-foreground";
  return "border-dashed text-muted-foreground hover:text-foreground";
}

/**
 * The whole grammar catalogue as a grid of grammar areas by CEFR level, marking the constructs on
 * the learner's grammar list. A construct opens its reference card, from which it can be added.
 */
export function CatalogueOverview({
  constructs,
  tracked: initialTracked,
}: {
  constructs: CatalogConstruct[];
  tracked: Tracked;
}) {
  const [tracked, setTracked] = useState(initialTracked);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const levels = CEFR_LEVELS.filter((l) => constructs.some((c) => c.level === l));
  const categories = GRAMMAR_CATEGORIES.filter((cat) => constructs.some((c) => c.category === cat.value));
  const visible = constructs.filter((c) =>
    filter === "all" ? true : filter === "tracked" ? Boolean(tracked[c.id]) : !tracked[c.id]
  );
  const count = (list: CatalogConstruct[]) => `${list.filter((c) => tracked[c.id]).length}/${list.length}`;
  const trackedCount = constructs.filter((c) => tracked[c.id]).length;
  const learnedCount = constructs.filter((c) => tracked[c.id]?.status === "learned").length;
  const selected = constructs.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-medium">{trackedCount}</span> of {constructs.length} constructs on your list
          {learnedCount > 0 && <span className="text-muted-foreground"> · {learnedCount} learned</span>}
        </p>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("rounded-md border px-1.5", chipClass(undefined))}>not tracked</span>
            <span className={cn("rounded-md border px-1.5", chipClass("to_work_on"))}>to work on</span>
            <span className={cn("rounded-md border px-1.5", chipClass("learned"))}>learned</span>
          </span>
          <nav className="flex gap-3">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                aria-pressed={f.value === filter}
                className={cn(
                  "text-muted-foreground hover:text-foreground",
                  f.value === filter && "font-medium text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div
        className="md:grid md:gap-x-2"
        style={{ gridTemplateColumns: `9rem repeat(${levels.length}, minmax(0, 1fr))` }}
      >
        {/* Level headers, with how many constructs of the level are tracked. */}
        <div className="hidden md:block" />
        {levels.map((level) => (
          <div key={level} className="hidden pb-2 text-sm font-medium md:block">
            {level}{" "}
            <span className="font-normal text-muted-foreground">
              {count(constructs.filter((c) => c.level === level))}
            </span>
          </div>
        ))}

        {categories.map((cat) => {
          const inCategory = constructs.filter((c) => c.category === cat.value);
          return (
            <div key={cat.value} className="mb-5 md:contents">
              <div className="border-t py-2 text-sm font-medium">
                {cat.label} <span className="font-normal text-muted-foreground">{count(inCategory)}</span>
              </div>
              {levels.map((level) => {
                const cell = visible.filter((c) => c.category === cat.value && c.level === level);
                return (
                  <div
                    key={level}
                    className={cn("flex flex-wrap content-start gap-1 py-2 md:border-t", cell.length === 0 && "hidden md:flex")}
                  >
                    <span className="w-6 shrink-0 pt-0.5 text-xs text-muted-foreground md:hidden">{level}</span>
                    {cell.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedId(c.id)}
                        title={c.description}
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-left text-xs leading-snug",
                          chipClass(tracked[c.id]?.status),
                          c.id === selectedId && "ring-2 ring-ring/60"
                        )}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {selected && (
        <ConstructDetail
          key={selected.id}
          construct={selected}
          tracked={tracked[selected.id] ?? null}
          nameOf={(id) => constructs.find((c) => c.id === id)?.name ?? null}
          onSelect={setSelectedId}
          onAdded={(itemId) => setTracked((t) => ({ ...t, [selected.id]: { itemId, status: "to_work_on" } }))}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

/** A construct's reference card, docked at the bottom of the screen. */
function ConstructDetail({
  construct,
  tracked,
  nameOf,
  onSelect,
  onAdded,
  onClose,
}: {
  construct: CatalogConstruct;
  tracked: { itemId: string; status: GrammarStatus } | null;
  nameOf: (id: string) => string | null;
  onSelect: (id: string) => void;
  onAdded: (itemId: string) => void;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const card = construct.card;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function add() {
    setPending(true);
    setError(null);
    try {
      onAdded(await addCatalogConstruct(construct.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the construct");
    } finally {
      setPending(false);
    }
  }

  return (
    <aside
      aria-label={construct.name}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-h-[60vh] max-w-3xl flex-col gap-3 overflow-y-auto rounded-xl border bg-background p-4 shadow-lg"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{construct.name}</h2>
          <GrammarTags level={construct.level} category={construct.category} />
          {tracked && <Badge>{STATUS_LABEL[tracked.status]}</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {tracked ? (
            <Link
              href={`/grammar#item-${tracked.itemId}`}
              className="text-sm underline underline-offset-4 hover:text-muted-foreground"
            >
              Open in my grammar
            </Link>
          ) : (
            <Button size="sm" onClick={add} disabled={pending}>
              {pending ? "Adding…" : "Add to my grammar"}
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {card ? (
        <>
          <p className="text-sm">
            {card.formation} {card.use}
          </p>
          {card.pitfalls.length > 0 && (
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Watch out</p>
              <ul className="list-disc pl-5">
                {card.pitfalls.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {card.contrasts.length > 0 && (
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Not to confuse with</p>
              <ul className="list-disc pl-5">
                {card.contrasts.map((c) => {
                  const name = nameOf(c.id);
                  return (
                    <li key={c.id}>
                      {name ? (
                        <button onClick={() => onSelect(c.id)} className="text-foreground underline underline-offset-2">
                          {name}
                        </button>
                      ) : (
                        c.id
                      )}
                      : {c.note}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <ul className="flex flex-col gap-2 text-sm">
            {card.examples.map((e, i) => (
              <GrammarExampleLine key={i} sentence={e.sentence} form={e.form} translation={e.translation} />
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm">{construct.description}</p>
      )}
    </aside>
  );
}
