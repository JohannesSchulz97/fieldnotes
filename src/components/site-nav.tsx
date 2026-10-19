"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Sources" },
  { href: "/vocab", label: "Vocabulary" },
  { href: "/grammar", label: "Grammar" },
  { href: "/exercises", label: "Exercises" },
];

export function SiteNav({ active, learning }: { active: string; learning: string[] }) {
  const pathname = usePathname();

  return (
    <header className="border-b">
      <nav className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
        <span className="font-semibold">Fieldnotes</span>
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "text-sm text-muted-foreground hover:text-foreground",
              (pathname === href ||
                (href === "/" && pathname.startsWith("/extractions")) ||
                (href === "/exercises" && pathname.startsWith("/exercises/"))) &&
                "font-medium text-foreground"
            )}
          >
            {label}
          </Link>
        ))}
        <LanguageSwitcher active={active} learning={learning} />
      </nav>
    </header>
  );
}
