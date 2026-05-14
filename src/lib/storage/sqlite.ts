import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { UIMessage } from "ai";
import { normalizeChatMessages } from "@/lib/chat/messages";
import {
  formatWorldTime,
  normalizeWorldState,
  starterWorldState,
  type WorldState,
} from "@/lib/game/schema";

const defaultDatabasePath = join(process.cwd(), "data", "app.db");
const databasePath = resolve(defaultDatabasePath);
export const SAVE_SLOT_COUNT = 10;

mkdirSync(dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath, {
  timeout: 5000,
});

db.exec(`
  PRAGMA busy_timeout = 5000;
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

  CREATE TABLE IF NOT EXISTS world_states (
    session_id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS save_slots (
    session_id TEXT NOT NULL,
    slot_index INTEGER NOT NULL,
    messages_json TEXT NOT NULL,
    world_state_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, slot_index),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
  );
`);

type SessionRow = {
  id: string;
};

type MessageRow = {
  message_json: string;
};

type WorldStateRow = {
  state_json: string;
};

type SaveSlotRow = {
  slot_index: number;
  messages_json: string;
  world_state_json: string;
  updated_at: string;
};

type GlobalSaveSlotRow = SaveSlotRow & {
  session_id: string;
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

const upsertWorldStateStatement = db.prepare(`
  INSERT INTO world_states (session_id, state_json)
  VALUES (?, ?)
  ON CONFLICT(session_id) DO UPDATE SET
    state_json = excluded.state_json,
    updated_at = CURRENT_TIMESTAMP
`);

const selectWorldStateStatement = db.prepare(`
  SELECT state_json
  FROM world_states
  WHERE session_id = ?
`);

const upsertSaveSlotStatement = db.prepare(`
  INSERT INTO save_slots (session_id, slot_index, messages_json, world_state_json)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(session_id, slot_index) DO UPDATE SET
    messages_json = excluded.messages_json,
    world_state_json = excluded.world_state_json,
    updated_at = CURRENT_TIMESTAMP
`);

const selectSaveSlotsStatement = db.prepare(`
  SELECT slot_index, messages_json, world_state_json, updated_at
  FROM save_slots
  WHERE session_id = ?
  ORDER BY slot_index ASC
`);

const selectAllSaveSlotsStatement = db.prepare(`
  SELECT session_id, slot_index, messages_json, world_state_json, updated_at
  FROM save_slots
  ORDER BY updated_at DESC, slot_index ASC
`);

const selectSaveSlotStatement = db.prepare(`
  SELECT slot_index, messages_json, world_state_json, updated_at
  FROM save_slots
  WHERE session_id = ? AND slot_index = ?
`);

const deleteSessionMessagesStatement = db.prepare(`
  DELETE FROM chat_messages
  WHERE session_id = ?
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

const saveSlotsTableInfoStatement = db.prepare(`
  PRAGMA table_info(save_slots)
`);

function migrateSaveSlotsTableIfNeeded() {
  const columns = saveSlotsTableInfoStatement.all() as Array<{ name: string }>;
  const hasSlotIndex = columns.some((column) => column.name === "slot_index");

  if (hasSlotIndex) {
    return;
  }

  db.exec("BEGIN");
  try {
    db.exec(`
      ALTER TABLE save_slots RENAME TO save_slots_legacy;

      CREATE TABLE save_slots (
        session_id TEXT NOT NULL,
        slot_index INTEGER NOT NULL,
        messages_json TEXT NOT NULL,
        world_state_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (session_id, slot_index),
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );

      INSERT INTO save_slots (
        session_id,
        slot_index,
        messages_json,
        world_state_json,
        created_at,
        updated_at
      )
      SELECT
        session_id,
        1,
        messages_json,
        world_state_json,
        created_at,
        updated_at
      FROM save_slots_legacy;

      DROP TABLE save_slots_legacy;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

migrateSaveSlotsTableIfNeeded();

export function ensureChatSession(sessionId: string) {
  const exists = chatSessionExists(sessionId);
  ensureSessionStatement.run(sessionId);
  if (!exists) {
    upsertWorldStateStatement.run(sessionId, JSON.stringify(starterWorldState));
  }
}

export function chatSessionExists(sessionId: string) {
  return Boolean(selectSessionStatement.get(sessionId) as SessionRow | undefined);
}

export function loadChatMessages(sessionId: string): UIMessage[] {
  const rows = selectMessagesStatement.all(sessionId) as MessageRow[];
  return normalizeChatMessages(rows.map((row) => JSON.parse(row.message_json) as UIMessage));
}

export function loadWorldState(sessionId: string): WorldState {
  ensureChatSession(sessionId);
  const row = selectWorldStateStatement.get(sessionId) as WorldStateRow | undefined;
  if (!row) {
    return structuredClone(starterWorldState);
  }
  return normalizeWorldState(JSON.parse(row.state_json) as WorldState);
}

export function saveWorldState(sessionId: string, worldState: WorldState) {
  ensureSessionStatement.run(sessionId);
  upsertWorldStateStatement.run(sessionId, JSON.stringify(normalizeWorldState(worldState)));
  touchSessionStatement.run(sessionId);
}

export function saveChatMessages(sessionId: string, messages: UIMessage[]) {
  const normalizedMessages = normalizeChatMessages(messages);

  db.exec("BEGIN");
  try {
    ensureSessionStatement.run(sessionId);
    deleteSessionMessagesStatement.run(sessionId);
    for (const message of normalizedMessages) {
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

export function replaceChatMessages(sessionId: string, messages: UIMessage[]) {
  saveChatMessages(sessionId, messages);
}

type SaveSlotSummary = {
  sessionId: string | null;
  slotIndex: number;
  updatedAt: string | null;
  playerName: string | null;
  playerRealm: string | null;
  playerSect: string | null;
  location: string | null;
  timeLabel: string | null;
  hp: number | null;
  maxHp: number | null;
  qi: number | null;
  maxQi: number | null;
};

type CheckpointData = {
  messages: UIMessage[];
  worldState: WorldState;
  updatedAt: string;
};

function buildSaveSlotSummary(slotIndex: number, row?: SaveSlotRow): SaveSlotSummary {
  if (!row) {
    return {
      sessionId: null,
      slotIndex,
      updatedAt: null,
      playerName: null,
      playerRealm: null,
      playerSect: null,
      location: null,
      timeLabel: null,
      hp: null,
      maxHp: null,
      qi: null,
      maxQi: null,
    };
  }

  const worldState = normalizeWorldState(JSON.parse(row.world_state_json) as WorldState);

  return {
    sessionId: null,
    slotIndex,
    updatedAt: row.updated_at,
    playerName: worldState.player.name,
    playerRealm: worldState.player.realm,
    playerSect: worldState.player.sect,
    location: worldState.location,
    timeLabel: formatWorldTime(worldState.time),
    hp: worldState.player.hp,
    maxHp: worldState.player.maxHp,
    qi: worldState.player.qi,
    maxQi: worldState.player.maxQi,
  };
}

function assertSaveSlotIndex(slotIndex: number) {
  if (!Number.isInteger(slotIndex) || slotIndex < 1 || slotIndex > SAVE_SLOT_COUNT) {
    throw new Error(`slotIndex must be between 1 and ${SAVE_SLOT_COUNT}`);
  }
}

export function listSaveSlots(sessionId: string): SaveSlotSummary[] {
  ensureChatSession(sessionId);
  const rows = selectSaveSlotsStatement.all(sessionId) as SaveSlotRow[];
  const rowsBySlot = new Map(rows.map((row) => [row.slot_index, row]));

  return Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => {
    const slotIndex = index + 1;
    const summary = buildSaveSlotSummary(slotIndex, rowsBySlot.get(slotIndex));
    return {
      ...summary,
      sessionId: summary.updatedAt ? sessionId : null,
    };
  });
}

export function listAllSaveSlots(): SaveSlotSummary[] {
  const rows = selectAllSaveSlotsStatement.all() as GlobalSaveSlotRow[];

  return rows.map((row) => {
    const summary = buildSaveSlotSummary(row.slot_index, row);
    return {
      ...summary,
      sessionId: row.session_id,
    };
  });
}

export function saveCheckpoint(
  sessionId: string,
  slotIndex: number,
  messages: UIMessage[],
  worldState: WorldState,
) {
  assertSaveSlotIndex(slotIndex);
  const normalizedMessages = normalizeChatMessages(messages);

  db.exec("BEGIN");
  try {
    ensureSessionStatement.run(sessionId);
    upsertSaveSlotStatement.run(
      sessionId,
      slotIndex,
      JSON.stringify(normalizedMessages),
      JSON.stringify(normalizeWorldState(worldState)),
    );
    touchSessionStatement.run(sessionId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function loadCheckpoint(sessionId: string, slotIndex: number): CheckpointData | null {
  assertSaveSlotIndex(slotIndex);
  ensureChatSession(sessionId);
  const row = selectSaveSlotStatement.get(sessionId, slotIndex) as SaveSlotRow | undefined;
  if (!row) {
    return null;
  }

  return {
    messages: normalizeChatMessages(JSON.parse(row.messages_json) as UIMessage[]),
    worldState: normalizeWorldState(JSON.parse(row.world_state_json) as WorldState),
    updatedAt: row.updated_at,
  };
}

export function restoreCheckpoint(sessionId: string, slotIndex: number) {
  const checkpoint = loadCheckpoint(sessionId, slotIndex);
  if (!checkpoint) {
    return null;
  }

  db.exec("BEGIN");
  try {
    ensureSessionStatement.run(sessionId);
    deleteSessionMessagesStatement.run(sessionId);
    for (const message of checkpoint.messages) {
      insertMessageStatement.run(
        sessionId,
        message.id,
        message.role,
        JSON.stringify(message),
      );
    }
    upsertWorldStateStatement.run(sessionId, JSON.stringify(normalizeWorldState(checkpoint.worldState)));
    touchSessionStatement.run(sessionId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return checkpoint;
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
  const dbConfig = loadLlmConfig();
  if (dbConfig) {
    return dbConfig;
  }

  return {
    apiKey: undefined,
    modelId: "",
    providerName: "openai",
    baseURL: undefined,
  };
}

export function getDatabasePath() {
  return databasePath;
}
