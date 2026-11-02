/** Tokens (input + output, all model calls) a single chat may use before it is closed for new messages. */
export const CHAT_TOKEN_CAP = Number(process.env.CHAT_TOKEN_CAP ?? 300_000);

/** Model steps (a tool call and its follow-up each count) one reply may take. */
export const CHAT_MAX_STEPS = 12;

/** Longest message the chat accepts, in characters. */
export const CHAT_MAX_MESSAGE_LENGTH = 8_000;
