import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  generateId,
  createUIMessageStreamResponse,
  type LanguageModelUsage,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
  validateUIMessages,
} from "ai";
import { z } from "zod";
import { getActiveLanguage } from "@/lib/active-language";
import { CHAT_MAX_MESSAGE_LENGTH, CHAT_MAX_STEPS, CHAT_TOKEN_CAP } from "@/lib/chat/config";
import { compactHistory } from "@/lib/chat/history";
import { chatSystemPrompt } from "@/lib/chat/system-prompt";
import { chatTools } from "@/lib/chat/tools";
import {
  addChatTokens,
  createChat,
  getChat,
  loadMessages,
  saveMessages,
  titleFromText,
} from "@/lib/db/chat";
import { getNativeLanguage } from "@/lib/languages";
import { model, reasoningEffort, trackTokenUsage } from "@/lib/llm/client";

export const maxDuration = 120;

const Body = z.object({
  id: z.uuid(),
  /** Only the newest message is sent; the history is loaded from the database. */
  message: z.looseObject({
    id: z.string().min(1).max(100),
    role: z.literal("user"),
    parts: z
      .array(z.looseObject({ type: z.literal("text"), text: z.string().max(CHAT_MAX_MESSAGE_LENGTH) }))
      .min(1),
  }),
});

function error(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** Token counts of one or more model calls, as the usage table takes them. */
function tokensOf(usages: LanguageModelUsage[]) {
  const sum = (pick: (u: LanguageModelUsage) => number | undefined) =>
    usages.reduce((total, u) => total + (pick(u) ?? 0), 0);
  return {
    inputTokens: sum((u) => u.inputTokens),
    cachedInputTokens: sum((u) => u.inputTokenDetails.cacheReadTokens),
    outputTokens: sum((u) => u.outputTokens),
  };
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("Invalid request.", 400);
  const { id } = parsed.data;
  const message = parsed.data.message as unknown as UIMessage;

  const language = await getActiveLanguage();
  const nativeLanguage = getNativeLanguage();

  let chat = await getChat(id, language);
  if (!chat) {
    const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ");
    // Does nothing if the id exists: a concurrent first message, or another language's chat.
    await createChat(id, language, titleFromText(text));
    chat = await getChat(id, language);
    // An id of another language's chat is not a new chat.
    if (!chat) return error("Chat not found.", 404);
  }
  if (chat.tokens >= CHAT_TOKEN_CAP) {
    return error("This chat has reached its token limit. Start a new chat.", 429);
  }

  const history = await loadMessages(id);
  const tools = chatTools(language);
  const messages = await validateUIMessages({ messages: [...history, message], tools });

  async function countUsage(usages: LanguageModelUsage[]) {
    const tokens = tokensOf(usages);
    if (tokens.inputTokens + tokens.outputTokens === 0) return;
    await Promise.all([
      trackTokenUsage("chat", tokens),
      addChatTokens(id, tokens.inputTokens + tokens.outputTokens),
    ]);
  }

  const result = streamText({
    model: openai(model),
    system: chatSystemPrompt(language, nativeLanguage),
    messages: await convertToModelMessages([...compactHistory(messages.slice(0, -1)), messages.at(-1)!], {
      tools,
    }),
    tools,
    stopWhen: stepCountIs(CHAT_MAX_STEPS),
    providerOptions: { openai: { reasoningEffort } },
    // The client aborts the request when the learner presses Stop (or leaves the page); the model
    // call stops with it instead of running on unseen.
    abortSignal: request.signal,
    onEnd: ({ totalUsage }) => countUsage([totalUsage]),
    // Only finished steps report usage; the tokens of the step that was cut off are not counted.
    onAbort: ({ steps }) => countUsage(steps.map((s) => s.usage)),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      originalMessages: messages,
      generateMessageId: generateId,
      onEnd: async ({ messages }) => {
        await saveMessages(id, messages);
      },
    }),
    // A copy of the stream is read to the end here, so what was generated before an abort (Stop,
    // a closed tab) is still saved.
    consumeSseStream: ({ stream }) => {
      void stream.pipeTo(new WritableStream()).catch(() => {});
    },
  });
}
