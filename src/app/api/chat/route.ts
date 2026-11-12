import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  generateId,
  createUIMessageStreamResponse,
  isToolUIPart,
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
import { chatToolApproval, chatTools } from "@/lib/chat/tools";
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

// A reply may generate a set of exercises inside the stream.
export const maxDuration = 300;

const UserMessage = z.looseObject({
  id: z.string().min(1).max(100),
  role: z.literal("user"),
  parts: z
    .array(z.looseObject({ type: z.literal("text"), text: z.string().max(CHAT_MAX_MESSAGE_LENGTH) }))
    .min(1),
});

/**
 * The last assistant message, sent back after the learner answered its approval requests. Only
 * the answers are taken from it; everything else comes from the stored message.
 */
const ApprovalMessage = z.looseObject({
  id: z.string().min(1).max(100),
  role: z.literal("assistant"),
  parts: z.array(
    z.looseObject({
      type: z.string(),
      approval: z
        .looseObject({ id: z.string(), approved: z.boolean().optional(), reason: z.string().max(500).optional() })
        .optional(),
    })
  ),
});

const Body = z.object({
  id: z.uuid(),
  /** Only the newest message is sent; the history is loaded from the database. */
  message: z.union([UserMessage, ApprovalMessage]),
});

/**
 * The stored assistant message with the learner's answers to its pending approval requests, or
 * null if the answers don't belong to it. Approval requests only ever come from the stored
 * message, so a client cannot approve a tool call the server did not ask about.
 */
function withApprovals(stored: UIMessage, sent: z.infer<typeof ApprovalMessage>): UIMessage | null {
  const answers = new Map(
    sent.parts.flatMap((p) =>
      p.approval && typeof p.approval.approved === "boolean"
        ? [[p.approval.id, { approved: p.approval.approved, reason: p.approval.reason }] as const]
        : []
    )
  );
  let answered = 0;
  const parts = stored.parts.map((part) => {
    if (!isToolUIPart(part) || part.state !== "approval-requested") return part;
    const answer = answers.get(part.approval.id);
    if (!answer) return part;
    answered++;
    return {
      ...part,
      state: "approval-responded",
      approval: { ...part.approval, approved: answer.approved, reason: answer.reason },
    } as UIMessage["parts"][number];
  });
  return answered > 0 ? { ...stored, parts } : null;
}

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
  const { id, message: sent } = parsed.data;

  const language = await getActiveLanguage();
  const nativeLanguage = getNativeLanguage();

  let chat = await getChat(id, language);
  if (!chat) {
    if (sent.role !== "user") return error("Chat not found.", 404);
    const text = sent.parts.map((p) => p.text).join(" ");
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
  let next: UIMessage[];
  if (sent.role === "user") {
    next = [...history, sent as unknown as UIMessage];
  } else {
    // An answer to approval requests continues the last stored message.
    const last = history.at(-1);
    const answered = last?.id === sent.id ? withApprovals(last, sent) : null;
    if (!answered) return error("Nothing to approve.", 409);
    next = [...history.slice(0, -1), answered];
  }
  const messages = await validateUIMessages({ messages: next, tools });

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
    toolApproval: chatToolApproval(language),
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
