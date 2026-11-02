"use client";

import type { UIMessage } from "ai";
import Link from "next/link";
import { ChatView } from "@/components/chat-view";

/** The /chat/[id] page: one chat at full size. */
export function ChatPage({
  chatId,
  initialMessages,
  full,
  isNew,
}: {
  chatId: string;
  initialMessages: UIMessage[];
  full?: boolean;
  /** At /chat/new; the address becomes the chat's own once its first message is sent. */
  isNew?: boolean;
}) {
  return (
    // Fills the viewport below the nav (its height plus its 1px border).
    <main className="mx-auto flex h-[calc(100dvh-var(--nav-height)-1px)] w-full max-w-3xl flex-col px-4 py-4">
      <Link href="/chat" className="mb-2 text-sm text-muted-foreground hover:text-foreground">
        ← All chats
      </Link>
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border">
        <ChatView
          chatId={chatId}
          initialMessages={initialMessages}
          full={full}
          onFirstMessage={isNew ? () => window.history.replaceState(null, "", `/chat/${chatId}`) : undefined}
        />
      </div>
    </main>
  );
}
