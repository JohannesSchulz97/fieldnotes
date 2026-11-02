import { isToolUIPart, type UIMessage } from "ai";

/** Tool outputs of earlier turns up to this size (JSON characters) stay in the model's history. */
const KEEP_OUTPUT_CHARS = 2_000;

const OMITTED = { omitted: "Shortened in the history. Call the tool again if you need this data." };

/**
 * The stored messages as the model sees them on a later turn: large tool outputs (vocabulary
 * pages, source texts) are replaced by a note, so every new message does not pay for them again.
 * The stored history keeps them in full.
 */
export function compactHistory(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) =>
    message.role !== "assistant"
      ? message
      : {
          ...message,
          parts: message.parts.map((part) =>
            isToolUIPart(part) &&
            part.state === "output-available" &&
            JSON.stringify(part.output ?? null).length > KEEP_OUTPUT_CHARS
              ? { ...part, output: OMITTED }
              : part
          ),
        }
  );
}
