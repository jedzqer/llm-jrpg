import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { UIMessage } from "ai";

const defaultDatabasePath = join(process.cwd(), "data", "app.db");
const databasePath = resolve(process.env.SQLITE_DATABASE_PATH || defaultDatabasePath);

mkdirSync(dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    role TEXT NOT NULL,
    message_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, message_id),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS llm_configs (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    provider_name TEXT NOT NULL,
    model_id TEXT NOT NULL,
    base_url TEXT,
    api_key TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

type SessionRow = {
  id: string;
};

type MessageRow = {
  message_json: string;
};

type LlmConfig = {
  providerName: string;
  modelId: string;
  baseURL?: string;
  apiKey?: string;
};

const ensureSessionStatement = db.prepare(`
  INSERT INTO chat_sessions (id)
  VALUES (?)
  ON CONFLICT(id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
`);

const insertMessageStatement = db.prepare(`
  INSERT INTO chat_messages (session_id, message_id, role, message_json)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(session_id, message_id) DO UPDATE SET
    role = excluded.role,
    message_json = excluded.message_json
`);

const touchSessionStatement = db.prepare(`
  UPDATE chat_sessions
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const selectSessionStatement = db.prepare(`
  SELECT id
  FROM chat_sessions
  WHERE id = ?
`);

const selectMessagesStatement = db.prepare(`
  SELECT message_json
  FROM chat_messages
  WHERE session_id = ?
  ORDER BY id ASC
`);

const upsertConfigStatement = db.prepare(`
  INSERT INTO llm_configs (id, provider_name, model_id, base_url, api_key)
  VALUES (1, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    provider_name = excluded.provider_name,
    model_id = excluded.model_id,
    base_url = excluded.base_url,
    api_key = excluded.api_key,
    updated_at = CURRENT_TIMESTAMP
`);

const selectConfigStatement = db.prepare(`
  SELECT provider_name, model_id, base_url, api_key
  FROM llm_configs
  WHERE id = 1
`);

export function ensureChatSession(sessionId: string) {
  ensureSessionStatement.run(sessionId);
}

export function chatSessionExists(sessionId: string) {
  return Boolean(selectSessionStatement.get(sessionId) as SessionRow | undefined);
}

export function loadChatMessages(sessionId: string): UIMessage[] {
  const rows = selectMessagesStatement.all(sessionId) as MessageRow[];
  return rows.map((row) => JSON.parse(row.message_json) as UIMessage);
}

export function saveChatMessages(sessionId: string, messages: UIMessage[]) {
  db.exec("BEGIN");
  try {
    ensureSessionStatement.run(sessionId);
    for (const message of messages) {
      insertMessageStatement.run(
        sessionId,
        message.id,
        message.role,
        JSON.stringify(message),
      );
    }
    touchSessionStatement.run(sessionId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function seedLlmConfigFromEnv() {
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY?.trim();
  const modelId = process.env.OPENAI_MODEL?.trim();
  const providerName = process.env.OPENAI_PROVIDER_NAME?.trim() || "openai";
  const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;

  if (!apiKey || !modelId) {
    return;
  }

  upsertConfigStatement.run(providerName, modelId, baseURL ?? null, apiKey);
}

export function saveLlmConfig(config: LlmConfig) {
  upsertConfigStatement.run(
    config.providerName,
    config.modelId,
    config.baseURL ?? null,
    config.apiKey ?? null,
  );
}

export function loadLlmConfig(): LlmConfig | null {
  const row = selectConfigStatement.get() as
    | {
        provider_name: string;
        model_id: string;
        base_url: string | null;
        api_key: string | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    providerName: row.provider_name,
    modelId: row.model_id,
    baseURL: row.base_url ?? undefined,
    apiKey: row.api_key ?? undefined,
  };
}

export function getResolvedLlmConfig(): LlmConfig {
  seedLlmConfigFromEnv();

  const dbConfig = loadLlmConfig();
  if (dbConfig?.apiKey && dbConfig.modelId) {
    return dbConfig;
  }

  return {
    apiKey: process.env.OPENAI_COMPATIBLE_API_KEY?.trim(),
    modelId: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    providerName: process.env.OPENAI_PROVIDER_NAME?.trim() || "openai",
    baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined,
  };
}

export function getDatabasePath() {
  return databasePath;
}
