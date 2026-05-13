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
import { normalizeChatMessages } from "@/lib/chat/messages";
import { getOrCreateSessionId } from "@/lib/chat/session";
import { starterWorldState } from "@/lib/game/schema";
import { gameTools } from "@/lib/ai/tools";

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

export default function Home() {
  const [input, setInput] = useState("");
  const [sessionId] = useState(() => getOrCreateSessionId());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
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

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [sessionId, setMessages]);

  const logRef = useRef<HTMLElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const busy = status === "streaming" || status === "submitted";
  const chatReady = historyLoaded && configLoaded && hasSavedApiKey && Boolean(modelId.trim());

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

  const deleteMessage = async (messageId: string) => {
    if (!sessionId || deletingMessageId) return;

    setDeletingMessageId(messageId);
    setBootError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, messageId }),
      });

      const data = (await res.json()) as { error?: string; messages?: GameUIMessage[] };
      if (!res.ok) {
        throw new Error(data.error || "删除消息失败");
      }

      setMessages(normalizeChatMessages(data.messages || []));
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "删除消息失败");
    } finally {
      setDeletingMessageId(null);
    }
  };

  return (
    <main className="chat-shell">
      <header className="chat-header">
        <div className="chat-header-top">
          <div>
            <p className="eyebrow">LLM 修仙 · 原型</p>
            <h1>青云宗 · 外门</h1>
          </div>
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
        <p className="lede">
          演武场试炼初日，雨后青石湿亮。执事林挽玉立于高台，目光掠过你袖中那枚来历不明的青铜铃。
          说一句话，看看你这一世的修途从何处起步。
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
        {bootError && <p className="chat-error">会话读取失败：{bootError}</p>}
        {configLoaded && !hasSavedApiKey && (
          <p className="chat-empty">先在上方填写并保存模型配置，之后才能开始对话。</p>
        )}
        {configLoaded && hasSavedApiKey && !modelId.trim() && (
          <p className="chat-empty">请先填写模型 ID 并保存，然后再开始对话。</p>
        )}
        {messages.length === 0 && (
          <p className="chat-empty">先开口说点什么，或者做点什么。比如「上前行礼，通报姓名」。</p>
        )}
        {messages.map((m) => (
          <article key={m.id} className={`chat-turn ${m.role}`}>
            <div className="chat-turn-head">
              <span className="chat-role">{m.role === "user" ? "你" : "叙事"}</span>
              <button
                type="button"
                className="message-delete"
                onClick={() => void deleteMessage(m.id)}
                disabled={busy || deletingMessageId === m.id}
                aria-label="删除这条消息"
              >
                {deletingMessageId === m.id ? "删除中……" : "删除"}
              </button>
            </div>
            <div className="chat-body">
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return <p key={`${m.id}-${i}`}>{part.text}</p>;
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
                    const { enemy, triggerDescription } = part.input;
                    return (
                      <CombatPanel
                        key={`${m.id}-${i}`}
                        player={starterWorldState.player}
                        enemy={enemy}
                        triggerDescription={triggerDescription}
                        onFinish={(outcome, summary) => {
                          const finalOutcome = (
                            outcome === "victory" || outcome === "defeat" || outcome === "fled"
                              ? outcome
                              : "defeat"
                          ) as "victory" | "defeat" | "fled";
                          addToolOutput({
                            tool: "startCombat",
                            toolCallId: part.toolCallId,
                            output: { outcome: finalOutcome, summary },
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
          placeholder="述说你的言语或行动……（Enter 发送，Shift+Enter 换行）"
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
    </main>
  );
}
