"use client";

import { useTransition } from "react";
import { deleteChatAction } from "@/app/chat/actions";
import { Button } from "@/components/ui/button";

export function ChatDeleteButton({ id, title }: { id: string; title: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Delete chat: ${title}`}
      onClick={() => {
        if (window.confirm("Delete this chat?")) startTransition(() => deleteChatAction(id));
      }}
    >
      Delete
    </Button>
  );
}
