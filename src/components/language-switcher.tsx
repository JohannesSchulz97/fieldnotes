"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addLanguage, setActiveLanguage } from "@/app/actions";
import { LEARNABLE_LANGUAGES, languageName } from "@/lib/languages";

const ADD = "__add__";

const selectClass =
  "h-8 rounded-lg border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

/** Dropdown of the learning languages, with a way to add another one. */
export function LanguageSwitcher({ active, learning }: { active: string; learning: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const addable = LEARNABLE_LANGUAGES.filter((l) => !learning.includes(l));

  function choose(language: string, action: (language: string) => Promise<void>) {
    startTransition(async () => {
      await action(language);
      setAdding(false);
      // Pages already on screen belong to the previous language; the Sources list is the start of the new one.
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      {adding ? (
        <>
          <select
            aria-label="Language to add"
            className={selectClass}
            disabled={pending}
            defaultValue=""
            onChange={(e) => e.target.value && choose(e.target.value, addLanguage)}
          >
            <option value="" disabled>
              Add language…
            </option>
            {addable.map((l) => (
              <option key={l} value={l}>
                {languageName(l)}
              </option>
            ))}
          </select>
          <button
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setAdding(false)}
          >
            Cancel
          </button>
        </>
      ) : (
        <select
          aria-label="Learning language"
          className={selectClass}
          disabled={pending}
          value={active}
          onChange={(e) =>
            e.target.value === ADD ? setAdding(true) : choose(e.target.value, setActiveLanguage)
          }
        >
          {learning.map((l) => (
            <option key={l} value={l}>
              {languageName(l)}
            </option>
          ))}
          {addable.length > 0 && <option value={ADD}>+ Add language…</option>}
        </select>
      )}
    </div>
  );
}
