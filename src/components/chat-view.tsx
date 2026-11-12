"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { SendHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { type ApprovalHandler, CreateExercisesPart } from "@/components/chat-tool-parts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, string> = {
  search_vocabulary: "Looked through your vocabulary",
  known_lemmas: "Read your known words",
  vocabulary_overview: "Counted your vocabulary",
  list_grammar_items: "Looked through your grammar items",
  grammar_catalogue: "Looked through the grammar catalogue",
  grammar_card: "Read a grammar card",
  list_sources: "Looked through your sources",
  get_source: "Read a source",
};

/** Whether the last message holds a tool call that waits for the learner's approval. */
function awaitingApproval(messages: UIMessage[]): boolean {
  const last = messages.at(-1);
  return (
    last?.role === "assistant" &&
    last.parts.some((p) => isToolUIPart(p) && p.state === "approval-requested" && !p.approval.isAutomatic)
  );
}

/** Whether a message holds the result of a call that created exercises. */
function createdExercises(message: UIMessage): boolean {
  return message.parts.some(
    (p) => isToolUIPart(p) && p.type === "tool-create_exercises" && p.state === "output-available"
  );
}

/** The text of a failed request: the server's message when it sent one. */
function errorText(error: Error): string {
  try {
    const parsed = JSON.parse(error.message);
    if (typeof parsed?.error === "string") return parsed.error;
  } catch {
    // Not JSON: a network failure or an unexpected response.
  }
  return "Something went wrong. Try again.";
}

/** react-markdown passes its syntax-tree node to custom components; it must not reach the DOM. */
function dom<P extends { node?: unknown }>(props: P): Omit<P, "node"> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

/** Markdown elements of assistant replies, styled for the small chat bubble. Raw HTML is not rendered. */
const MARKDOWN: Components = {
  p: (props) => <p className="my-2 first:mt-0 last:mb-0" {...dom(props)} />,
  ul: (props) => <ul className="my-2 list-disc pl-5" {...dom(props)} />,
  ol: (props) => <ol className="my-2 list-decimal pl-5" {...dom(props)} />,
  li: (props) => <li className="my-0.5" {...dom(props)} />,
  h1: (props) => <p className="my-2 font-semibold" {...dom(props)} />,
  h2: (props) => <p className="my-2 font-semibold" {...dom(props)} />,
  h3: (props) => <p className="my-2 font-semibold" {...dom(props)} />,
  a: (props) => <a className="underline underline-offset-2" target="_blank" rel="noreferrer" {...dom(props)} />,
  code: (props) => <code className="rounded bg-background/60 px-1 font-mono text-xs" {...dom(props)} />,
  pre: (props) => <pre className="my-2 overflow-x-auto rounded bg-background/60 p-2" {...dom(props)} />,
  table: (props) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...dom(props)} />
    </div>
  ),
  th: (props) => <th className="border-b px-2 py-1 text-left font-medium" {...dom(props)} />,
  td: (props) => <td className="border-b px-2 py-1 align-top" {...dom(props)} />,
  blockquote: (props) => <blockquote className="my-2 border-l-2 pl-3 text-muted-foreground" {...dom(props)} />,
};

function MessageView({
  message,
  onApproval,
  busy,
}: {
  message: UIMessage;
  onApproval: ApprovalHandler;
  busy: boolean;
}) {
  const user = message.role === "user";
  return (
    <div className={cn("flex flex-col gap-1", user ? "items-end" : "items-start")}>
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          if (!part.text) return null;
          return user ? (
            <p
              key={i}
              className="max-w-[90%] whitespace-pre-wrap break-words rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
            >
              {part.text}
            </p>
          ) : (
            <div key={i} className="max-w-[90%] break-words rounded-lg bg-muted px-3 py-2 text-sm">
              <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>
                {part.text}
              </Markdown>
            </div>
          );
        }
        if (isToolUIPart(part)) {
          const name = part.type.replace(/^tool-/, "");
          if (part.type === "tool-create_exercises") {
            return <CreateExercisesPart key={i} part={part} onApproval={onApproval} disabled={busy} />;
          }
          return (
            <p key={i} className="text-xs text-muted-foreground">
              {TOOL_LABELS[name] ?? "Looked something up"}
              {part.state === "output-error" && " (failed)"}
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}

/**
 * One chat: its messages and the input. `chatId` is chosen by the client for a new chat; the
 * server creates the chat with the first message. Key it by chat, so switching chats starts fresh.
 */
export function ChatView({
  chatId,
  initialMessages,
  full = false,
  onFirstMessage,
  onBusyChange,
  emptyHint = "Ask about your vocabulary or grammar, e.g. “Which A2 constructs have I not saved yet?”",
  placeholder = "Message",
  className,
}: {
  chatId: string;
  initialMessages: UIMessage[];
  /** The chat reached its token cap. */
  full?: boolean;
  /** Called once the first message of a new chat is sent. */
  onFirstMessage?: () => void;
  /** Called when a reply starts or ends. */
  onBusyChange?: (busy: boolean) => void;
  /** Shown before the first message. */
  emptyHint?: ReactNode;
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error, stop, addToolApprovalResponse } = useChat({
    id: chatId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // The server holds the history; only the new message travels.
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: { id, message: messages[messages.length - 1] },
      }),
    }),
    // An answer to an approval request goes to the server at once, which then runs the tool.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    // New exercises (and maybe a new grammar item) change the page behind the chat.
    onFinish: ({ message }) => {
      if (createdExercises(message)) router.refresh();
    },
  });
  const busy = status === "submitted" || status === "streaming";
  // A pending approval must be answered before the chat goes on.
  const waiting = awaitingApproval(messages);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    // Scrolls the message list only, not the page around it.
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages, status]);

  function submit() {
    const text = input.trim();
    if (!text || busy || full || waiting) return;
    if (messages.length === 0) onFirstMessage?.();
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div ref={list} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && <p className="text-sm text-muted-foreground">{emptyHint}</p>}
        {messages.map((m) => (
          <MessageView
            key={m.id}
            message={m}
            busy={busy}
            onApproval={(id, approved) => addToolApprovalResponse({ id, approved })}
          />
        ))}
        {status === "submitted" && <p className="text-xs text-muted-foreground">Thinking…</p>}
        {error && <p className="text-sm text-destructive">{errorText(error)}</p>}
        {full && (
          <p className="text-sm text-muted-foreground">
            This chat has reached its token limit. Start a new chat to continue.
          </p>
        )}
        {waiting && !busy && (
          <p className="text-xs text-muted-foreground">Answer the request above to continue.</p>
        )}
      </div>
      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          maxLength={8000}
          placeholder={placeholder}
          aria-label="Message"
          disabled={full}
          className="max-h-32 min-h-9 flex-1 resize-none"
        />
        {busy ? (
          <Button type="button" variant="outline" onClick={() => stop()}>
            Stop
          </Button>
        ) : (
          <Button type="submit" size="icon-lg" aria-label="Send" disabled={!input.trim() || full || waiting}>
            <SendHorizontal />
          </Button>
        )}
      </form>
    </div>
  );
}
