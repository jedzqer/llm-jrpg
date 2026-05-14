"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  InferUITools,
  lastAssistantMessageIsCompleteWithToolCalls,
  UIMessage,
} from "ai";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { CombatPanel } from "@/components/chat/CombatPanel";
import { RichText } from "@/components/chat/RichText";
import {
  createSessionId,
  getOrCreateSessionId,
  setStoredSessionId,
} from "@/lib/chat/session";
import { gameTools, type WorldStateChangeInput } from "@/lib/ai/tools";
import { formatWorldTime, normalizeWorldState, starterWorldState, type WorldState } from "@/lib/game/schema";

type GameUIMessage = UIMessage<never, Record<string, unknown>, InferUITools<typeof gameTools>>;
type LlmConfigResponse = {
  databasePath: string;
  llm: {
    providerName: string;
    modelId: string;
    baseURL: string | null;
    hasApiKey: boolean;
  };
};

async function persistWorldState(sessionId: string, worldState: WorldState) {
  const res = await fetch("/api/world", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId, worldState }),
  });

  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error || "保存世界状态失败");
  }
}

function applyWorldStateChange(worldState: WorldState, change: WorldStateChangeInput): WorldState {
  return normalizeWorldState({
    ...worldState,
    location: change.location ?? worldState.location,
    scene: change.scene ?? worldState.scene,
    time: change.time ? { ...worldState.time, ...change.time } : worldState.time,
    activeQuest: change.quest
      ? {
          ...worldState.activeQuest,
          stage: change.quest.stage ?? worldState.activeQuest.stage,
          objective: change.quest.objective ?? worldState.activeQuest.objective,
        }
      : worldState.activeQuest,
  });
}

function summarizeWorldStateChange(previous: WorldState, next: WorldState) {
  const changes: string[] = [];

  if (previous.location !== next.location) {
    changes.push(`地点变更为 ${next.location}`);
  }
  if (
    previous.time.day !== next.time.day ||
    previous.time.phase !== next.time.phase ||
    previous.time.clock !== next.time.clock
  ) {
    changes.push(`时间推进至 ${formatWorldTime(next.time)}`);
  }
  if (previous.scene !== next.scene) {
    changes.push(`场景更新为 ${next.scene}`);
  }
  if (previous.activeQuest.stage !== next.activeQuest.stage) {
    changes.push(`任务阶段变更为 ${next.activeQuest.stage}`);
  }
  if (previous.activeQuest.objective !== next.activeQuest.objective) {
    changes.push(`任务目标更新为 ${next.activeQuest.objective}`);
  }

  return changes.join("；") || "世界状态未发生可见变化";
}

function getMessageStatusSnapshot(message: GameUIMessage, fallback: WorldState) {
  const statusPart = [...message.parts]
    .reverse()
    .find((part) => part.type === "tool-updateWorldState" && part.state === "output-available") as
    | {
        output?: {
          snapshot?: {
            location: string;
            scene: string;
            time: WorldState["time"];
          };
        };
      }
    | undefined;

  return (
    statusPart?.output?.snapshot ?? {
      location: fallback.location,
      scene: fallback.scene,
      time: fallback.time,
    }
  );
}

type SaveStatusResponse = {
  saveSlots: Array<{
    sessionId?: string | null;
    slotIndex: number;
    updatedAt: string | null;
    playerName: string | null;
    playerRealm: string | null;
    location: string | null;
    timeLabel?: string | null;
  }>;
};

export default function Home() {
  const emptySaveSlots = Array.from({ length: 10 }, (_, index) => ({
    sessionId: null,
    slotIndex: index + 1,
    updatedAt: null,
    playerName: null,
    playerRealm: null,
    location: null,
    timeLabel: null,
  }));

  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState(() => getOrCreateSessionId());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);
  const [menuMode, setMenuMode] = useState<"root" | "load">("root");
  const [bootError, setBootError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [worldLoaded, setWorldLoaded] = useState(false);
  const [worldState, setWorldState] = useState<WorldState>(starterWorldState);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [loadBusy, setLoadBusy] = useState(false);
  const [menuBusy, setMenuBusy] = useState(false);
  const [activeSlotIndex, setActiveSlotIndex] = useState(1);
  const [saveSlots, setSaveSlots] = useState<SaveStatusResponse["saveSlots"]>(emptySaveSlots);
  const [globalSaveSlots, setGlobalSaveSlots] = useState<SaveStatusResponse["saveSlots"]>([]);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configNotice, setConfigNotice] = useState<string | null>(null);
  const [databasePath, setDatabasePath] = useState("");
  const [providerName, setProviderName] = useState("openai");
  const [modelId, setModelId] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const appliedWorldToolCallsRef = useRef(new Set<string>());

  const { messages, setMessages, sendMessage, status, error, addToolOutput } =
    useChat<GameUIMessage>({
      id: sessionId || undefined,
      transport: new DefaultChatTransport({
        api: "/api/chat",
        body: sessionId ? { sessionId } : undefined,
      }),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    });

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      try {
        const res = await fetch("/api/config");
        if (!res.ok) {
          throw new Error("读取模型配置失败");
        }

        const data = (await res.json()) as LlmConfigResponse;
        if (cancelled) return;

        setDatabasePath(data.databasePath);
        setProviderName(data.llm.providerName || "openai");
        setModelId(data.llm.modelId || "");
        setBaseURL(data.llm.baseURL || "");
        setHasSavedApiKey(Boolean(data.llm.hasApiKey));
        setConfigLoaded(true);
      } catch (err) {
        if (cancelled) return;
        setConfigError(err instanceof Error ? err.message : "读取模型配置失败");
        setConfigLoaded(true);
      }
    };

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadGlobalSaveStatus = async () => {
      try {
        const res = await fetch("/api/save");
        if (!res.ok) {
          throw new Error("读取全局存档失败");
        }

        const data = (await res.json()) as SaveStatusResponse;
        if (cancelled) return;

        setGlobalSaveSlots(Array.isArray(data.saveSlots) ? data.saveSlots : []);
      } catch (err) {
        if (cancelled) return;
        setBootError(err instanceof Error ? err.message : "读取全局存档失败");
      }
    };

    void loadGlobalSaveStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    const loadHistory = async () => {
      try {
        const res = await fetch(`/api/chat?sessionId=${encodeURIComponent(sessionId)}`);
        if (!res.ok) {
          throw new Error("加载历史对话失败");
        }

        const data = (await res.json()) as { messages?: GameUIMessage[] };
        if (!cancelled && Array.isArray(data.messages)) {
          setMessages(data.messages);
          setHistoryLoaded(true);
        }
      } catch (err) {
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : "加载历史对话失败");
          setHistoryLoaded(true);
        }
      }
    };

    const loadWorld = async () => {
      try {
        const res = await fetch(`/api/world?sessionId=${encodeURIComponent(sessionId)}`);
        if (!res.ok) {
          throw new Error("加载世界状态失败");
        }

        const data = (await res.json()) as { worldState?: WorldState };
        if (!cancelled && data.worldState) {
          setWorldState(normalizeWorldState(data.worldState));
          setWorldLoaded(true);
        }
      } catch (err) {
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : "加载世界状态失败");
          setWorldLoaded(true);
        }
      }
    };

    const loadSaveStatus = async () => {
      try {
        const res = await fetch(`/api/save?sessionId=${encodeURIComponent(sessionId)}`);
        if (!res.ok) {
          throw new Error("读取存档状态失败");
        }

        const data = (await res.json()) as SaveStatusResponse;
        if (!cancelled) {
          setSaveSlots(Array.isArray(data.saveSlots) ? data.saveSlots : []);
        }
      } catch (err) {
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : "读取存档状态失败");
        }
      }
    };

    void loadHistory();
    void loadWorld();
    void loadSaveStatus();

    return () => {
      cancelled = true;
    };
  }, [sessionId, setMessages]);

  const logRef = useRef<HTMLElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!sessionId) return;

    const pending = messages.flatMap((message) =>
      message.parts.flatMap((part) => {
        if (part.type !== "tool-updateWorldState" || part.state !== "input-available") {
          return [];
        }
        if (appliedWorldToolCallsRef.current.has(part.toolCallId)) {
          return [];
        }

        return [{ toolCallId: part.toolCallId, input: part.input as WorldStateChangeInput }];
      }),
    );

    if (pending.length === 0) {
      return;
    }

    let nextWorldState = worldState;
    const outputs = pending.map(({ toolCallId, input }) => {
      appliedWorldToolCallsRef.current.add(toolCallId);
      const previousWorldState = nextWorldState;
      nextWorldState = applyWorldStateChange(nextWorldState, input);
      return {
        toolCallId,
        output: {
          summary: summarizeWorldStateChange(previousWorldState, nextWorldState),
          snapshot: {
            location: nextWorldState.location,
            scene: nextWorldState.scene,
            time: nextWorldState.time,
            questStage: nextWorldState.activeQuest.stage,
            questObjective: nextWorldState.activeQuest.objective,
          },
        },
      };
    });

    setWorldState(nextWorldState);
    for (const { toolCallId, output } of outputs) {
      addToolOutput({
        tool: "updateWorldState",
        toolCallId,
        output,
      });
    }

    void persistWorldState(sessionId, nextWorldState).catch((err) => {
      setBootError(err instanceof Error ? err.message : "保存世界状态失败");
    });
  }, [messages, sessionId, worldState, addToolOutput]);

  const busy = status === "streaming" || status === "submitted";
  const playerDead = worldState.player.hp <= 0;
  const activeSlot = saveSlots.find((slot) => slot.slotIndex === activeSlotIndex);
  const activeSlotHasSave = Boolean(activeSlot?.updatedAt);
  const chatReady =
    historyLoaded &&
    worldLoaded &&
    configLoaded &&
    hasSavedApiKey &&
    Boolean(modelId.trim()) &&
    !playerDead;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || !sessionId || !chatReady) return;
    sendMessage({ text });
    setInput("");
  };

  const refreshGlobalSaves = async () => {
    const res = await fetch("/api/save");
    if (!res.ok) {
      throw new Error("读取全局存档失败");
    }

    const data = (await res.json()) as SaveStatusResponse;
    setGlobalSaveSlots(Array.isArray(data.saveSlots) ? data.saveSlots : []);
  };

  const saveConfig = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setConfigError(null);
    setConfigNotice(null);

    const trimmedProviderName = providerName.trim();
    const trimmedModelId = modelId.trim();
    const trimmedBaseURL = baseURL.trim();
    const trimmedApiKey = apiKey.trim();

    if (!trimmedProviderName || !trimmedModelId) {
      setConfigError("Provider 和模型 ID 不能为空。");
      return;
    }

    if (!trimmedApiKey && !hasSavedApiKey) {
      setConfigError("首次保存时必须提供 API Key。");
      return;
    }

    setConfigSaving(true);

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerName: trimmedProviderName,
          modelId: trimmedModelId,
          baseURL: trimmedBaseURL || null,
          apiKey: trimmedApiKey || null,
        }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "保存模型配置失败");
      }

      setHasSavedApiKey(true);
      setApiKey("");
      setConfigNotice("模型配置已保存到应用数据库。");
      setSettingsOpen(false);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "保存模型配置失败");
    } finally {
      setConfigSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(e);
    }
  };

  const saveGame = async (slotIndex: number) => {
    if (!sessionId || busy || saveBusy || loadBusy) return;

    setSaveBusy(true);
    setBootError(null);

    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, slotIndex }),
      });

      const data = (await res.json()) as SaveStatusResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "存档失败");
      }

      setActiveSlotIndex(slotIndex);
      setSaveSlots(Array.isArray(data.saveSlots) ? data.saveSlots : []);
      await refreshGlobalSaves();
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "存档失败");
    } finally {
      setSaveBusy(false);
    }
  };

  const loadGame = async (slotIndex: number) => {
    const slot = saveSlots.find((item) => item.slotIndex === slotIndex);
    if (!sessionId || busy || saveBusy || loadBusy || !slot?.updatedAt) return;

    setLoadBusy(true);
    setBootError(null);

    try {
      const res = await fetch("/api/save", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, slotIndex }),
      });

      const data = (await res.json()) as {
        error?: string;
        messages?: GameUIMessage[];
        worldState?: WorldState;
        saveSlots?: SaveStatusResponse["saveSlots"];
      };
      if (!res.ok || !data.messages || !data.worldState) {
        throw new Error(data.error || "读档失败");
      }

      setActiveSlotIndex(slotIndex);
      setMessages(data.messages);
      setWorldState(normalizeWorldState(data.worldState));
      setSaveSlots(Array.isArray(data.saveSlots) ? data.saveSlots : []);
      await refreshGlobalSaves();
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "读档失败");
    } finally {
      setLoadBusy(false);
    }
  };

  const handleCombatFinish = async (
    toolCallId: string,
    result: {
      outcome: "victory" | "defeat" | "fled";
      summary: string;
      player: { hp: number; maxHp: number; qi: number; maxQi: number };
      enemy: { id: string; hp: number; maxHp: number; qi: number; maxQi: number };
    },
  ) => {
    if (!sessionId) return;

    const nextNpc =
      worldState.activeNpc.id === result.enemy.id
        ? {
            ...worldState.activeNpc,
            hp: result.enemy.hp,
            maxHp: result.enemy.maxHp,
            qi: result.enemy.qi,
            maxQi: result.enemy.maxQi,
          }
        : worldState.activeNpc;

    const nextWorldState: WorldState = {
      ...worldState,
      player: {
        ...worldState.player,
        hp: result.player.hp,
        maxHp: result.player.maxHp,
        qi: result.player.qi,
        maxQi: result.player.maxQi,
      },
      activeNpc: nextNpc,
    };

    setWorldState(normalizeWorldState(nextWorldState));

    try {
      await persistWorldState(sessionId, normalizeWorldState(nextWorldState));
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "保存世界状态失败");
    }

    addToolOutput({
      tool: "startCombat",
      toolCallId,
      output: {
        outcome: result.outcome,
        summary: result.summary,
        player: result.player,
        enemy: result.enemy,
      },
    });
  };

  const player = worldState.player;
  const world = worldState;
  const hasActiveProgress = messages.length > 0 || saveSlots.some((slot) => Boolean(slot.updatedAt));
  const visibleGlobalSaves = globalSaveSlots.filter((slot) => slot.updatedAt && slot.sessionId);

  const startNewGame = () => {
    const nextSessionId = createSessionId();
    if (!nextSessionId) return;

    setStoredSessionId(nextSessionId);
    appliedWorldToolCallsRef.current.clear();
    setSessionId(nextSessionId);
    setMessages([]);
    setWorldState(starterWorldState);
    setInput("");
    setActiveSlotIndex(1);
    setSaveSlots(emptySaveSlots);
    setBootError(null);
    setMenuMode("root");
    setMenuOpen(false);
  };

  const loadMenuSave = async (targetSessionId: string, slotIndex: number) => {
    if (menuBusy) return;

    setMenuBusy(true);
    setBootError(null);

    try {
      const res = await fetch("/api/save", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId: targetSessionId, slotIndex }),
      });

      const data = (await res.json()) as {
        error?: string;
        messages?: GameUIMessage[];
        worldState?: WorldState;
        saveSlots?: SaveStatusResponse["saveSlots"];
      };
      if (!res.ok || !data.messages || !data.worldState) {
        throw new Error(data.error || "读档失败");
      }

      setStoredSessionId(targetSessionId);
      appliedWorldToolCallsRef.current.clear();
      setSessionId(targetSessionId);
      setMessages(data.messages);
      setWorldState(normalizeWorldState(data.worldState));
      setSaveSlots(Array.isArray(data.saveSlots) ? data.saveSlots : []);
      setInput("");
      setActiveSlotIndex(slotIndex);
      setMenuMode("root");
      setMenuOpen(false);
      await refreshGlobalSaves();
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "读档失败");
    } finally {
      setMenuBusy(false);
    }
  };

  return (
    <main className="chat-shell">
      {menuOpen && (
        <section className="main-menu-overlay" aria-label="主菜单">
          <div className="main-menu-panel">
            <p className="eyebrow">LLM 修仙 · 主菜单</p>
            <h2>青云宗山门</h2>
            <p className="main-menu-lede">
              {menuMode === "root"
                ? "选择一条路。可以自此开新局，也可以从旧日存档续上因果。"
                : "从已有存档中择一卷入局。读取后会回到该会话对应的时间点。"}
            </p>

            {menuMode === "root" ? (
              <div className="main-menu-actions">
                <button type="button" className="button primary main-menu-button" onClick={startNewGame}>
                  新建游戏
                </button>
                <button
                  type="button"
                  className="button main-menu-button"
                  onClick={() => setMenuMode("load")}
                  disabled={visibleGlobalSaves.length === 0}
                >
                  读取存档
                </button>
                {hasActiveProgress && (
                  <button type="button" className="button main-menu-button" onClick={() => setMenuOpen(false)}>
                    返回游戏
                  </button>
                )}
              </div>
            ) : (
              <div className="main-menu-load-section">
                <div className="main-menu-load-head">
                  <p className="save-meta">
                    {visibleGlobalSaves.length > 0
                      ? `共发现 ${visibleGlobalSaves.length} 个可读取存档`
                      : "当前还没有可读取存档"}
                  </p>
                  <button type="button" className="button" onClick={() => setMenuMode("root")} disabled={menuBusy}>
                    返回
                  </button>
                </div>
                <div className="main-menu-save-list">
                  {visibleGlobalSaves.map((slot) => (
                    <article key={`${slot.sessionId}-${slot.slotIndex}-${slot.updatedAt}`} className="main-menu-save-card">
                      <div className="main-menu-save-copy">
                        <span className="save-slot-title">
                          {slot.slotIndex} 号档 · 会话 {slot.sessionId?.slice(0, 8)}
                        </span>
                        <strong className="save-slot-name">{slot.playerName ?? "未命名角色"}</strong>
                        <span className="save-slot-realm">{slot.playerRealm ?? "境界未知"}</span>
                        <span className="save-slot-location">{slot.location ?? "未知地点"}</span>
                        <span className="save-slot-time">{slot.timeLabel ?? "时序未定"}</span>
                        <span className="save-slot-time">
                          {slot.updatedAt ? new Date(slot.updatedAt).toLocaleString() : "尚未存档"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="button primary"
                        onClick={() => void loadMenuSave(slot.sessionId!, slot.slotIndex)}
                        disabled={menuBusy}
                      >
                        {menuBusy ? "读取中……" : "读取此档"}
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
      <aside className="player-sidebar">
        <section className="player-panel">
          <div className="player-panel-head">
            <div>
              <p className="eyebrow">修士命盘</p>
              <h2>{player.name}</h2>
            </div>
            <p className="player-realm">{player.realm}</p>
          </div>

          <div className="player-meta-grid">
            <div className="player-meta-card">
              <span className="player-meta-label">门派</span>
              <strong>{player.sect}</strong>
            </div>
            <div className="player-meta-card">
              <span className="player-meta-label">灵根</span>
              <strong>{player.spiritRoot}</strong>
            </div>
          </div>

          <div className="player-stat-block">
            <div className="player-stat-head">
              <span>气血</span>
              <strong>
                {player.hp} / {player.maxHp}
              </strong>
            </div>
            <div className="player-stat-track">
              <div className="player-stat-fill hp" style={{ width: `${(player.hp / player.maxHp) * 100}%` }} />
            </div>
          </div>

          <div className="player-stat-block">
            <div className="player-stat-head">
              <span>灵力</span>
              <strong>
                {player.qi} / {player.maxQi}
              </strong>
            </div>
            <div className="player-stat-track">
              <div className="player-stat-fill qi" style={{ width: `${(player.qi / player.maxQi) * 100}%` }} />
            </div>
          </div>

          <section className="player-section">
            <div className="player-section-head">
              <span className="eyebrow">当前处境</span>
            </div>
            <div className="player-scene-card">
              <p>{world.location}</p>
              <strong>{formatWorldTime(world.time)}</strong>
              <span>{world.scene}</span>
            </div>
          </section>

          <section className="player-section">
            <div className="player-section-head">
              <span className="eyebrow">随身物品</span>
            </div>
            <ul className="token-list">
              {player.inventory.map((item) => (
                <li key={item} className="token-item">
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="player-section">
            <div className="player-section-head">
              <span className="eyebrow">所习术法</span>
            </div>
            <div className="skill-list">
              {player.skills.map((skill) => (
                <article key={skill.id} className="skill-card">
                  <div className="skill-card-head">
                    <strong>{skill.name}</strong>
                    <span>{skill.qiCost} 灵力</span>
                  </div>
                  <p>{skill.description}</p>
                </article>
              ))}
            </div>
          </section>
        </section>
      </aside>

      <div className="chat-main">
        <header className="chat-header">
          <div className="chat-header-top">
            <div>
              <p className="eyebrow">LLM 修仙 · 原型</p>
              <h1>青云宗 · 外门</h1>
            </div>
            <div className="header-actions">
              <button
                type="button"
                className="button"
                onClick={() => {
                  setMenuMode("root");
                  setMenuOpen(true);
                }}
              >
                主菜单
              </button>
              <button
                type="button"
                className={`button settings-button ${settingsOpen ? "active" : ""}`}
                onClick={() => setSettingsOpen((open) => !open)}
                aria-expanded={settingsOpen}
                aria-controls="llm-settings"
              >
                设置
              </button>
            </div>
          </div>
          <p className="lede">
            演武场试炼初日，雨后青石湿亮。执事林挽玉立于高台，目光掠过你袖中那枚来历不明的青铜铃。
            说一句话，看看你这一世的修途从何处起步。
          </p>
          <section className="save-panel">
            <div className="save-panel-head">
              <p className="eyebrow">存档栏</p>
              <p className="save-meta">
                {activeSlotHasSave
                  ? `当前选中 ${activeSlotIndex} 号档：${activeSlot?.location ?? "未知地点"}`
                  : `当前选中 ${activeSlotIndex} 号档：空`}
              </p>
            </div>
            <div className="save-slot-grid">
              {saveSlots.map((slot) => (
                <article
                  key={slot.slotIndex}
                  className={`save-slot-card ${slot.slotIndex === activeSlotIndex ? "active" : ""}`}
                >
                  <button
                    type="button"
                    className="save-slot-select"
                    onClick={() => setActiveSlotIndex(slot.slotIndex)}
                  >
                    <span className="save-slot-title">{slot.slotIndex} 号档</span>
                    <strong className="save-slot-name">{slot.playerName ?? "未存档角色"}</strong>
                    <span className="save-slot-realm">{slot.playerRealm ?? "境界未知"}</span>
                    <span className="save-slot-location">{slot.location ?? "空档位"}</span>
                    <span className="save-slot-time">{slot.timeLabel ?? "时序未定"}</span>
                    <span className="save-slot-time">
                      {slot.updatedAt ? new Date(slot.updatedAt).toLocaleString() : "尚未存档"}
                    </span>
                  </button>
                  <div className="save-slot-actions">
                    <button
                      type="button"
                      className="button"
                      onClick={() => void saveGame(slot.slotIndex)}
                      disabled={!sessionId || busy || saveBusy || loadBusy}
                    >
                      {saveBusy && activeSlotIndex === slot.slotIndex ? "存档中……" : "存档"}
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => void loadGame(slot.slotIndex)}
                      disabled={!sessionId || busy || saveBusy || loadBusy || !slot.updatedAt}
                    >
                      {loadBusy && activeSlotIndex === slot.slotIndex ? "读档中……" : "读档"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </header>

        <section
          id="llm-settings"
          className={`config-panel ${settingsOpen ? "open" : "collapsed"}`}
          aria-hidden={!settingsOpen}
        >
          <div className="config-panel-heading">
            <div>
              <p className="eyebrow">模型配置</p>
              <h2>在应用内设置 LLM</h2>
            </div>
            {databasePath && <p className="config-meta">数据库：{databasePath}</p>}
          </div>
          <p className="config-help">
            不再从配置文件读取模型信息。配置会直接保存到应用自己的 SQLite 数据库。
          </p>
          {!configLoaded && <p className="chat-empty">正在读取当前模型配置……</p>}
          {configError && <p className="chat-error">配置错误：{configError}</p>}
          {configNotice && <p className="config-success">{configNotice}</p>}
          <form className="config-form" onSubmit={saveConfig}>
            <label className="field">
              <span>Provider 名称</span>
              <input
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="openai"
                disabled={!configLoaded || configSaving}
              />
            </label>
            <label className="field">
              <span>模型 ID</span>
              <input
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="gpt-4o-mini"
                disabled={!configLoaded || configSaving}
              />
            </label>
            <label className="field field-full">
              <span>Base URL（可选）</span>
              <input
                value={baseURL}
                onChange={(e) => setBaseURL(e.target.value)}
                placeholder="https://api.openai.com/v1"
                disabled={!configLoaded || configSaving}
              />
            </label>
            <label className="field field-full">
              <span>API Key{hasSavedApiKey ? "（留空表示保留现有值）" : ""}</span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasSavedApiKey ? "输入新 key 以覆盖" : "输入你的 API Key"}
                disabled={!configLoaded || configSaving}
              />
            </label>
            <div className="config-actions">
              <p className="config-status">
                {hasSavedApiKey ? "当前已保存 API Key。" : "当前尚未保存 API Key。"}
              </p>
              <button type="submit" className="button primary" disabled={!configLoaded || configSaving}>
                {configSaving ? "保存中……" : "保存配置"}
              </button>
            </div>
          </form>
        </section>

        <section className="chat-log" aria-live="polite" ref={logRef}>
          {!historyLoaded && <p className="chat-empty">正在回溯此前的因果……</p>}
          {!worldLoaded && <p className="chat-empty">正在载入当前命盘……</p>}
          {bootError && <p className="chat-error">会话读取失败：{bootError}</p>}
          {configLoaded && !hasSavedApiKey && (
            <p className="chat-empty">先在上方填写并保存模型配置，之后才能开始对话。</p>
          )}
          {configLoaded && hasSavedApiKey && !modelId.trim() && (
            <p className="chat-empty">请先填写模型 ID 并保存，然后再开始对话。</p>
          )}
          {playerDead && (
            <p className="chat-error">你已身死道消，当前只能读档重来。请先点击上方“读档”。</p>
          )}
          {messages.length === 0 && (
            <p className="chat-empty">先开口说点什么，或者做点什么。比如「上前行礼，通报姓名」。</p>
          )}
          {messages.map((m) => (
            <article key={m.id} className={`chat-turn ${m.role}`}>
              <div className="chat-turn-head">
                <span className="chat-role">{m.role === "user" ? "你" : "叙事"}</span>
              </div>
              <div className="chat-body">
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <p key={`${m.id}-${i}`}>
                        <RichText text={part.text} />
                      </p>
                    );
                  }

                  if (part.type === "tool-updateWorldState") {
                    return null;
                  }

                  if (part.type === "tool-startCombat") {
                    if (part.state === "input-streaming") {
                      return (
                        <p key={`${m.id}-${i}`} className="combat-loading">
                          战斗即将开始……
                        </p>
                      );
                    }

                    if (part.state === "input-available") {
                      const { combatType, enemy, triggerDescription } = part.input;
                      return (
                        <CombatPanel
                          key={`${m.id}-${i}`}
                          player={worldState.player}
                          enemy={enemy}
                          combatType={combatType}
                          triggerDescription={triggerDescription}
                          onFinish={(result) => {
                            const finalOutcome = (
                              result.outcome === "victory" ||
                              result.outcome === "defeat" ||
                              result.outcome === "fled"
                                ? result.outcome
                                : "defeat"
                            ) as "victory" | "defeat" | "fled";

                            void handleCombatFinish(part.toolCallId, {
                              ...result,
                              outcome: finalOutcome,
                            });
                          }}
                        />
                      );
                    }

                    if (part.state === "output-available") {
                      const out = part.output as { summary: string };
                      return (
                        <p key={`${m.id}-${i}`} className="combat-done">
                          ⚔ {out.summary}
                        </p>
                      );
                    }
                  }

                  return null;
                })}
              </div>
              {m.role === "assistant" && (
                <div className="chat-status-bar">
                  {(() => {
                    const snapshot = getMessageStatusSnapshot(m, worldState);
                    return (
                      <>
                        <span>地点：{snapshot.location}</span>
                        <span>时间：{formatWorldTime(snapshot.time)}</span>
                      </>
                    );
                  })()}
                </div>
              )}
            </article>
          ))}
          {error && <p className="chat-error">出了点岔子：{error.message}</p>}
        </section>

        <form className="chat-input" onSubmit={submit}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={playerDead ? "你已死亡，请先读档。" : "述说你的言语或行动……（Enter 发送，Shift+Enter 换行）"}
            rows={3}
            disabled={busy || !chatReady || !sessionId}
          />
          <button
            type="submit"
            className="button primary"
            disabled={busy || !input.trim() || !chatReady || !sessionId}
          >
            {busy ? "运转灵力……" : "发送"}
          </button>
        </form>
      </div>
    </main>
  );
}
