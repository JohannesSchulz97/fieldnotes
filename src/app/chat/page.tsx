import Link from "next/link";
import { connection } from "next/server";
import { ChatDeleteButton } from "@/components/chat-delete-button";
import { buttonVariants } from "@/components/ui/button";
import { getActiveLanguage } from "@/lib/active-language";
import { listChats } from "@/lib/db/chat";

export default async function ChatsPage() {
  await connection();
  const chats = await listChats(await getActiveLanguage());

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Chats</h1>
        <Link href="/chat/new" className={buttonVariants()}>
          New chat
        </Link>
      </div>
      {chats.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No chats yet. Start one here, or with the chat button on any page.
        </p>
      ) : (
        <ul className="divide-y">
          {chats.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-3">
              <Link href={`/chat/${c.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="block truncate text-sm font-medium">{c.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {new Date(c.updatedAt).toLocaleDateString()}
                </span>
              </Link>
              <ChatDeleteButton id={c.id} title={c.title} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
