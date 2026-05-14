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
import { getOrCreateSessionId } from "@/lib/chat/session";
import { gameTools } from "@/lib/ai/tools";
import { starterWorldState, type WorldState } from "@/lib/game/schema";

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

type SaveStatusResponse = {
  hasSave: boolean;
  updatedAt: string | null;
};

export default function Home() {
  const [input, setInput] = useState("");
  const [sessionId] = useState(() => getOrCreateSessionId());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [worldLoaded, setWorldLoaded] = useState(false);
  const [worldState, setWorldState] = useState<WorldState>(starterWorldState);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [loadBusy, setLoadBusy] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [saveUpdatedAt, setSaveUpdatedAt] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configNotice, setConfigNotice] = useState<string | null>(null);
  const [databasePath, setDatabasePath] = useState("");
  const [providerName, setProviderName] = useState("openai");
  const [modelId, setModelId] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);

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
          setWorldState(data.worldState);
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
          setHasSave(Boolean(data.hasSave));
          setSaveUpdatedAt(data.updatedAt ?? null);
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

  const busy = status === "streaming" || status === "submitted";
  const playerDead = worldState.player.hp <= 0;
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

  const saveGame = async () => {
    if (!sessionId || busy || saveBusy || loadBusy) return;

    setSaveBusy(true);
    setBootError(null);

    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });

      const data = (await res.json()) as { error?: string; updatedAt?: string | null };
      if (!res.ok) {
        throw new Error(data.error || "存档失败");
      }

      setHasSave(true);
      setSaveUpdatedAt(data.updatedAt ?? null);
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "存档失败");
    } finally {
      setSaveBusy(false);
    }
  };

  const loadGame = async () => {
    if (!sessionId || busy || saveBusy || loadBusy || !hasSave) return;

    setLoadBusy(true);
    setBootError(null);

    try {
      const res = await fetch("/api/save", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });

      const data = (await res.json()) as {
        error?: string;
        messages?: GameUIMessage[];
        worldState?: WorldState;
        updatedAt?: string | null;
      };
      if (!res.ok || !data.messages || !data.worldState) {
        throw new Error(data.error || "读档失败");
      }

      setMessages(data.messages);
      setWorldState(data.worldState);
      setSaveUpdatedAt(data.updatedAt ?? null);
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

    setWorldState(nextWorldState);

    try {
      await persistWorldState(sessionId, nextWorldState);
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

  return (
    <main className="chat-shell">
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
                onClick={() => void saveGame()}
                disabled={!sessionId || busy || saveBusy || loadBusy}
              >
                {saveBusy ? "存档中……" : "存档"}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => void loadGame()}
                disabled={!sessionId || busy || saveBusy || loadBusy || !hasSave}
              >
                {loadBusy ? "读档中……" : "读档"}
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
          <p className="save-meta">
            {hasSave
              ? `当前存档：${saveUpdatedAt ? new Date(saveUpdatedAt).toLocaleString() : "已存在"}`
              : "当前没有存档。"}
          </p>
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
