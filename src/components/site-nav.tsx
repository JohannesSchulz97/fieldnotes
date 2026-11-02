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
  { href: "/chat", label: "Chat" },
];

export function SiteNav({ active, learning }: { active: string; learning: string[] }) {
  const pathname = usePathname();

  return (
    <header className="border-b">
      <nav className="mx-auto flex h-(--nav-height) max-w-5xl items-center gap-6 px-4">
        <span className="font-semibold">Fieldnotes</span>
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "text-sm text-muted-foreground hover:text-foreground",
              (pathname === href ||
                (href === "/" && pathname.startsWith("/extractions")) ||
                (href === "/exercises" && pathname.startsWith("/exercises/")) ||
                (href === "/grammar" && pathname.startsWith("/grammar/")) ||
                (href === "/chat" && pathname.startsWith("/chat/"))) &&
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
