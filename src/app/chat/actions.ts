"use server";

import { revalidatePath } from "next/cache";
import type { UIMessage } from "ai";
import { getActiveLanguage } from "@/lib/active-language";
import { CHAT_TOKEN_CAP } from "@/lib/chat/config";
import { deleteChat, getChat, listChats, loadMessages } from "@/lib/db/chat";

export interface ChatListItem {
  id: string;
  title: string;
  updatedAt: string;
}

export interface LoadedChat {
  messages: UIMessage[];
  /** The chat used up its token cap and takes no more messages. */
  full: boolean;
}

/** The active language's most recent chats, for the panel. */
export async function listRecentChats(): Promise<ChatListItem[]> {
  const chats = await listChats(await getActiveLanguage(), 8);
  return chats.map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
}

/** A chat's stored messages; null if it does not exist in the active language. */
export async function loadChat(id: string): Promise<LoadedChat | null> {
  const chat = await getChat(id, await getActiveLanguage());
  if (!chat) return null;
  return { messages: await loadMessages(id), full: chat.tokens >= CHAT_TOKEN_CAP };
}

export async function deleteChatAction(id: string): Promise<void> {
  await deleteChat(id, await getActiveLanguage());
  revalidatePath("/chat");
}
