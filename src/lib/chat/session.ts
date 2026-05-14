const storageKey = "llm-jrpg-session-id";

export function getStoredSessionId() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(storageKey) ?? "";
}

export function createSessionId() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.crypto.randomUUID();
}

export function setStoredSessionId(sessionId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, sessionId);
}

export function getOrCreateSessionId() {
  const existing = getStoredSessionId();
  if (existing) {
    return existing;
  }

  const nextId = createSessionId();
  if (!nextId) {
    return "";
  }

  window.localStorage.setItem(storageKey, nextId);
  return nextId;
}
