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
import { getOrCreateSessionId } from "@/lib/chat/session";
import { starterWorldState } from "@/lib/game/schema";
import { gameTools } from "@/lib/ai/tools";

type GameUIMessage = UIMessage<never, Record<string, unknown>, InferUITools<typeof gameTools>>;

export default function Home() {
  const [input, setInput] = useState("");
  const [sessionId] = useState(() => getOrCreateSessionId());
  const [bootError, setBootError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || !sessionId) return;
    sendMessage({ text });
    setInput("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(e);
    }
  };

  return (
    <main className="chat-shell">
      <header className="chat-header">
        <p className="eyebrow">LLM 修仙 · 原型</p>
        <h1>青云宗 · 外门</h1>
        <p className="lede">
          演武场试炼初日，雨后青石湿亮。执事林挽玉立于高台，目光掠过你袖中那枚来历不明的青铜铃。
          说一句话，看看你这一世的修途从何处起步。
        </p>
      </header>

      <section className="chat-log" aria-live="polite" ref={logRef}>
        {!historyLoaded && <p className="chat-empty">正在回溯此前的因果……</p>}
        {bootError && <p className="chat-error">会话读取失败：{bootError}</p>}
        {messages.length === 0 && (
          <p className="chat-empty">先开口说点什么，或者做点什么。比如「上前行礼，通报姓名」。</p>
        )}
        {messages.map((m) => (
          <article key={m.id} className={`chat-turn ${m.role}`}>
            <span className="chat-role">{m.role === "user" ? "你" : "叙事"}</span>
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
          disabled={busy || !historyLoaded || !sessionId}
        />
        <button
          type="submit"
          className="button primary"
          disabled={busy || !input.trim() || !historyLoaded || !sessionId}
        >
          {busy ? "运转灵力……" : "发送"}
        </button>
      </form>
    </main>
  );
}
