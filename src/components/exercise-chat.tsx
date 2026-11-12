"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ChatView } from "@/components/chat-view";
import { Button } from "@/components/ui/button";

/**
 * The chat on the exercises page: describe the exercises you want, answer a question or two, and
 * approve the set. It is an ordinary chat, so it is also listed on the chat page.
 */
export function ExerciseChat({ initialChatId }: { initialChatId: string }) {
  const [chatId, setChatId] = useState(initialChatId);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);

  function newChat() {
    setChatId(crypto.randomUUID());
    setStarted(false);
  }

  return (
    <section className="mb-8 flex max-h-[32rem] flex-col rounded-xl border">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <h2 className="text-sm font-medium">Create exercises</h2>
        {started && (
          <div className="flex items-center gap-3 text-sm">
            <Link href={`/chat/${chatId}`} className="text-muted-foreground hover:text-foreground">
              Open in chat
            </Link>
            <Button size="sm" variant="ghost" disabled={busy} onClick={newChat}>
              <Plus />
              New
            </Button>
          </div>
        )}
      </div>
      <ChatView
        key={chatId}
        chatId={chatId}
        initialMessages={[]}
        onFirstMessage={() => setStarted(true)}
        onBusyChange={setBusy}
        emptyHint="Describe the exercises you want, e.g. “10 exercises on the past tenses, about travelling”. I’ll ask what I need to know."
        placeholder="Describe the exercises you want"
      />
    </section>
  );
}
