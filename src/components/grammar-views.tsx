import Link from "next/link";
import { cn } from "@/lib/utils";

const VIEWS = [
  { href: "/grammar", label: "My grammar" },
  { href: "/grammar/catalogue", label: "Catalogue" },
];

/** Switch between the saved items and the language's grammar catalogue. */
export function GrammarViews({ active }: { active: "/grammar" | "/grammar/catalogue" }) {
  return (
    <div className="flex rounded-lg border p-0.5 text-sm">
      {VIEWS.map((v) => (
        <Link
          key={v.href}
          href={v.href}
          aria-current={v.href === active ? "page" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground",
            v.href === active && "bg-muted font-medium text-foreground"
          )}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}
