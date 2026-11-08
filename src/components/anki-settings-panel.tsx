"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { buildCard } from "@/lib/anki";
import { getNativeLanguage, languageName } from "@/lib/languages";
import type { AnkiSettings, ExtractedItem } from "@/lib/types";
import { cn } from "@/lib/utils";

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-24 text-sm text-muted-foreground">{label}</span>
      <div className="inline-flex rounded-lg border p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md px-3 py-1 text-sm text-muted-foreground hover:text-foreground",
              value === o.value && "bg-muted font-medium text-foreground"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Anki export options with a live preview of one card. */
export function AnkiSettingsPanel({
  settings,
  onChange,
  language,
  previewItem,
  previewTranslation,
}: {
  settings: AnkiSettings;
  onChange: (settings: AnkiSettings) => void;
  language: string;
  previewItem: ExtractedItem | undefined;
  previewTranslation: string | null;
}) {
  const set = <K extends keyof AnkiSettings>(key: K, value: AnkiSettings[K]) =>
    onChange({ ...settings, [key]: value });
  // HTML from buildCard is escaped there, so it is safe to render.
  const learning = languageName(language);
  const native = languageName(getNativeLanguage());
  const card = previewItem && buildCard(language, previewItem, settings, previewTranslation);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <Choice
        label="Direction"
        value={settings.direction}
        onChange={(v) => set("direction", v)}
        options={[
          { value: "learning-native", label: `${learning} → ${native}` },
          { value: "native-learning", label: `${native} → ${learning}` },
          { value: "both", label: "Both" },
        ]}
      />
      <Choice
        label="Example"
        value={settings.example}
        onChange={(v) => set("example", v)}
        options={[
          { value: "off", label: "Off" },
          { value: "front", label: "On front" },
          { value: "back", label: "On back" },
        ]}
      />
      <Choice
        label="Example from"
        value={settings.exampleSource}
        onChange={(v) => set("exampleSource", v)}
        options={[
          { value: "short", label: "Short example" },
          { value: "short-then-source", label: "Short, else text" },
          { value: "source", label: "Text" },
          { value: "both", label: "Both" },
        ]}
      />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pl-28 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={settings.sentenceTranslation}
            disabled={settings.example === "off"}
            onCheckedChange={(checked) => set("sentenceTranslation", checked)}
          />
          Example translation
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={settings.partOfSpeech}
            onCheckedChange={(checked) => set("partOfSpeech", checked)}
          />
          Part of speech
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={settings.pattern}
            onCheckedChange={(checked) => set("pattern", checked)}
          />
          Pattern
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={settings.forms}
            onCheckedChange={(checked) => set("forms", checked)}
          />
          Forms
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={settings.register}
            onCheckedChange={(checked) => set("register", checked)}
          />
          Register
        </label>
      </div>
      <p className="pl-28 text-xs text-muted-foreground">
        Pattern, forms, register and the short example are generated when you export, so the
        preview does not show them.
      </p>
      {settings.direction === "both" && (
        <p className="pl-28 text-xs text-muted-foreground">
          One note per word; Anki creates the reverse card. &quot;On front&quot; puts the example
          on the {learning} side.
        </p>
      )}
      {card && (
        <div className="mt-1 grid grid-cols-2 gap-3 text-sm">
          {(["front", "back"] as const).map((side) => (
            <div key={side} className="rounded-md bg-muted/50 p-3">
              <div className="mb-1 text-xs text-muted-foreground">
                {side === "front" ? "Front" : "Back"}
              </div>
              <div dangerouslySetInnerHTML={{ __html: card[side] }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
