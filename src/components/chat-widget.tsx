"use client";

import type { UIMessage } from "ai";
import { ArrowLeft, MessageCircle, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  type ChatListItem,
  deleteChatAction,
  listRecentChats,
  loadChat,
} from "@/app/chat/actions";
import { ChatView } from "@/components/chat-view";
import { Button } from "@/components/ui/button";

type View =
  | { kind: "list" }
  /** `loadedAt` keys the chat view, so reloaded messages replace the ones it holds. */
  | { kind: "chat"; id: string; messages: UIMessage[]; full: boolean; loadedAt: number };

/**
 * The floating chat button and its panel. Mounted in the root layout, so the open panel and the
 * running chat survive client navigation. The layout keys it by language: switching language
 * drops the chat of the old one.
 */
export function ChatWidget() {
  const pathname = usePathname();
  // The /chat pages are the chat. The panel is only hidden there, so a reply keeps streaming.
  const onChatPage = pathname.startsWith("/chat");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });
  const [recent, setRecent] = useState<ChatListItem[] | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const wasOnChatPage = useRef(onChatPage);

  // The list is fetched when it is shown, so it includes chats created since.
  useEffect(() => {
    if (!open || view.kind !== "list") return;
    let cancelled = false;
    listRecentChats().then((chats) => !cancelled && setRecent(chats));
    return () => {
      cancelled = true;
    };
  }, [open, view.kind]);

  // Back from a /chat page, the open chat may have been continued there: reload it, unless a
  // reply is still streaming into the panel.
  useEffect(() => {
    const left = wasOnChatPage.current && !onChatPage;
    wasOnChatPage.current = onChatPage;
    if (!left || view.kind !== "chat" || busy.current) return;
    const id = view.id;
    let cancelled = false;
    loadChat(id).then((chat) => {
      if (cancelled || !chat) return;
      setView((v) => (v.kind === "chat" && v.id === id ? { kind: "chat", id, ...chat, loadedAt: Date.now() } : v));
    });
    return () => {
      cancelled = true;
    };
  }, [onChatPage, view]);

  function openChat(id: string) {
    startTransition(async () => {
      const chat = await loadChat(id);
      if (chat) setView({ kind: "chat", id, ...chat, loadedAt: Date.now() });
      else setView({ kind: "list" });
    });
  }

  function newChat() {
    setView({ kind: "chat", id: crypto.randomUUID(), messages: [], full: false, loadedAt: Date.now() });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this chat?")) return;
    startTransition(async () => {
      await deleteChatAction(id);
      setRecent((chats) => chats?.filter((c) => c.id !== id) ?? null);
    });
  }

  return (
    <div hidden={onChatPage}>
      {!open && (
        <Button
          size="icon-lg"
          className="fixed right-4 bottom-4 z-40 size-12 rounded-full shadow-lg"
          aria-label="Open chat"
          onClick={() => setOpen(true)}
        >
          <MessageCircle className="size-5" />
        </Button>
      )}
      {open && (
        <section
          aria-label="Chat"
          className="fixed inset-0 z-50 flex flex-col bg-background sm:inset-auto sm:right-4 sm:bottom-4 sm:h-[36rem] sm:max-h-[calc(100dvh-2rem)] sm:w-[26rem] sm:rounded-xl sm:border sm:shadow-xl"
        >
          <header className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
            {view.kind === "chat" && (
              <Button variant="ghost" size="icon" aria-label="Back to chats" onClick={() => setView({ kind: "list" })}>
                <ArrowLeft />
              </Button>
            )}
            <span className="px-1 text-sm font-medium">{view.kind === "chat" ? "Chat" : "Chats"}</span>
            <div className="ml-auto flex items-center gap-1">
              {view.kind === "chat" && (
                <Button variant="ghost" size="icon" aria-label="New chat" onClick={newChat}>
                  <Plus />
                </Button>
              )}
              <Button variant="ghost" size="icon" aria-label="Close chat" onClick={() => setOpen(false)}>
                <X />
              </Button>
            </div>
          </header>
          {view.kind === "chat" ? (
            <ChatView
              key={`${view.id}:${view.loadedAt}`}
              chatId={view.id}
              initialMessages={view.messages}
              full={view.full}
              onBusyChange={(b) => (busy.current = b)}
            />
          ) : (
            <div className="flex-1 overflow-y-auto p-3">
              <Button className="mb-3 w-full" onClick={newChat}>
                <Plus data-icon="inline-start" /> New chat
              </Button>
              {recent === null ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No chats yet.</p>
              ) : (
                <ul className="divide-y">
                  {recent.map((c) => (
                    <li key={c.id} className="flex items-center gap-1 py-1">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => openChat(c.id)}
                        className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                      >
                        <span className="block truncate text-sm">{c.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {new Date(c.updatedAt).toLocaleDateString()}
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete chat: ${c.title}`}
                        disabled={pending}
                        onClick={() => remove(c.id)}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/chat" className="mt-3 block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
                All chats
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
