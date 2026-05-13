const storageKey = "llm-jrpg-session-id";

export function getOrCreateSessionId() {
  if (typeof window === "undefined") {
    return "";
  }

  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const nextId = window.crypto.randomUUID();
  window.localStorage.setItem(storageKey, nextId);
  return nextId;
}
