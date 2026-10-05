"use client";

import { useEffect, useState } from "react";

/**
 * Like useState for a small set of string choices, remembered per browser in localStorage.
 * Starts with the fallback on the server and first render, then switches to the stored value.
 */
export function useStoredChoice<T extends string>(
  key: string,
  choices: readonly T[],
  fallback: T
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key) as T | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage after hydration
      if (stored && choices.includes(stored)) setValue(stored);
    } catch {
      // Storage unavailable (private mode etc.): keep the fallback.
    }
  }, [key, choices]);

  function update(next: T) {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // Ignore: the choice just won't be remembered.
    }
  }

  return [value, update];
}
