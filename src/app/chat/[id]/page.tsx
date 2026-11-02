import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ChatPage } from "@/components/chat-page";
import { getActiveLanguage } from "@/lib/active-language";
import { CHAT_TOKEN_CAP } from "@/lib/chat/config";
import { getChat, loadMessages } from "@/lib/db/chat";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ChatRoute({ params }: PageProps<"/chat/[id]">) {
  await connection();
  const { id } = await params;

  if (id === "new") {
    return <ChatPage chatId={crypto.randomUUID()} initialMessages={[]} isNew />;
  }
  if (!UUID.test(id)) notFound();
  const chat = await getChat(id, await getActiveLanguage());
  if (!chat) notFound();
  return (
    <ChatPage
      chatId={id}
      initialMessages={await loadMessages(id)}
      full={chat.tokens >= CHAT_TOKEN_CAP}
    />
  );
}
