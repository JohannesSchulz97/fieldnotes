"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setActiveLanguage } from "@/app/actions";

/** On a page that belongs to one language: makes that language the active one if it is not. */
export function ActiveLanguageSync({ language, active }: { language: string; active: string }) {
  const router = useRouter();
  useEffect(() => {
    if (language === active) return;
    setActiveLanguage(language)
      .then(() => router.refresh())
      .catch(() => {});
  }, [language, active, router]);
  return null;
}
