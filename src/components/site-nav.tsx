"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Extract" },
  { href: "/vocab", label: "Vocabulary" },
];

export function SiteNav() {
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
              (pathname === href || (href === "/" && pathname.startsWith("/extractions"))) &&
                "font-medium text-foreground"
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
