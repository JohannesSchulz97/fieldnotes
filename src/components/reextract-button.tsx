"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { reextract } from "@/app/actions";

export function ReextractButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!confirm("Run the extraction again? This calls the API and costs money.")) return;
    setPending(true);
    try {
      await reextract(id);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={pending}>
      {pending ? "Re-extracting…" : "Re-extract"}
    </Button>
  );
}
