import type { UIMessage } from "ai";

type AllowedRole = UIMessage["role"];

function isAllowedRole(role: string): role is AllowedRole {
  return role === "system" || role === "user" || role === "assistant";
}

export function normalizeChatMessages<T extends UIMessage>(messages: T[]): T[] {
  const normalized: T[] = [];

  for (const message of messages) {
    if (!isAllowedRole(message.role)) {
      continue;
    }

    const parts = Array.isArray(message.parts) ? [...message.parts] : [];
    if (parts.length === 0) {
      continue;
    }

    const nextMessage: T = {
      ...message,
      role: message.role,
      parts,
    } as T;

    const previousMessage = normalized.at(-1);
    if (previousMessage && previousMessage.role === nextMessage.role) {
      previousMessage.parts = [...previousMessage.parts, ...nextMessage.parts];
      if (previousMessage.metadata == null && nextMessage.metadata != null) {
        previousMessage.metadata = nextMessage.metadata;
      }
      continue;
    }

    normalized.push(nextMessage);
  }

  return normalized;
}
