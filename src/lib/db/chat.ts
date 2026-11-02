import "server-only";
import type { UIMessage } from "ai";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { LanguageCode } from "../types";
import { db } from ".";
import { chatMessages, chats } from "./schema";

export interface ChatSummary {
  id: string;
  title: string;
  tokens: number;
  createdAt: string;
  updatedAt: string;
}

const TITLE_LENGTH = 60;

/** A chat's title from its first message: the text cut at a word boundary. */
export function titleFromText(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= TITLE_LENGTH) return flat || "New chat";
  return `${flat.slice(0, TITLE_LENGTH).replace(/\s\S*$/, "")}…`;
}

/** A language's chats, most recently active first. Chats without a stored message (a first reply that failed) are left out. */
export async function listChats(language: LanguageCode, limit?: number): Promise<ChatSummary[]> {
  const query = db
    .select({
      id: chats.id,
      title: chats.title,
      tokens: chats.tokens,
      createdAt: chats.createdAt,
      updatedAt: chats.updatedAt,
    })
    .from(chats)
    .where(
      and(
        eq(chats.language, language),
        sql`exists (select 1 from ${chatMessages} where ${chatMessages.chatId} = ${chats.id})`
      )
    )
    .orderBy(desc(chats.updatedAt));
  return limit ? query.limit(limit) : query;
}

/** One chat, or null if it does not exist in this language. */
export async function getChat(id: string, language: LanguageCode): Promise<ChatSummary | null> {
  const [row] = await db
    .select({
      id: chats.id,
      title: chats.title,
      tokens: chats.tokens,
      createdAt: chats.createdAt,
      updatedAt: chats.updatedAt,
    })
    .from(chats)
    .where(and(eq(chats.id, id), eq(chats.language, language)));
  return row ?? null;
}

/** Creates a chat; does nothing if the id exists already (in any language). */
export async function createChat(id: string, language: LanguageCode, title: string): Promise<void> {
  const now = new Date().toISOString();
  await db.insert(chats).values({ id, language, title, createdAt: now, updatedAt: now }).onConflictDoNothing();
}

export async function loadMessages(chatId: string): Promise<UIMessage[]> {
  const rows = await db
    .select({ message: chatMessages.message })
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(asc(chatMessages.createdAt), sql`rowid`);
  return rows.map((r) => r.message);
}

/**
 * Stores a chat's complete message list: new messages are added, known ones (a reply that grew
 * while streaming) are overwritten. Creation time is kept, so the order stays the one of the chat.
 * A message id that belongs to another chat is left alone.
 */
export async function saveMessages(chatId: string, messages: UIMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const now = new Date().toISOString();
  await db.batch([
    db
      .insert(chatMessages)
      .values(messages.map((message) => ({ id: message.id, chatId, message, createdAt: now })))
      .onConflictDoUpdate({
        target: chatMessages.id,
        set: { message: sql`excluded.message` },
        setWhere: eq(chatMessages.chatId, chatId),
      }),
    db.update(chats).set({ updatedAt: now }).where(eq(chats.id, chatId)),
  ]);
}

/** Counts tokens of one model call against the chat's cap. */
export async function addChatTokens(chatId: string, tokens: number): Promise<void> {
  await db
    .update(chats)
    .set({ tokens: sql`${chats.tokens} + ${tokens}` })
    .where(eq(chats.id, chatId));
}

export async function deleteChat(id: string, language: LanguageCode): Promise<void> {
  if (!(await getChat(id, language))) return;
  await db.batch([
    db.delete(chatMessages).where(eq(chatMessages.chatId, id)),
    db.delete(chats).where(eq(chats.id, id)),
  ]);
}
