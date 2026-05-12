"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const logRef = useRef<HTMLElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const busy = status === "streaming" || status === "submitted";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
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
        {messages.length === 0 && (
          <p className="chat-empty">先开口说点什么，或者做点什么。比如「上前行礼，通报姓名」。</p>
        )}
        {messages.map((m) => (
          <article key={m.id} className={`chat-turn ${m.role}`}>
            <span className="chat-role">{m.role === "user" ? "你" : "叙事"}</span>
            <div className="chat-body">
              {m.parts.map((part, i) =>
                part.type === "text" ? <p key={`${m.id}-${i}`}>{part.text}</p> : null,
              )}
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
          disabled={busy}
        />
        <button type="submit" className="button primary" disabled={busy || !input.trim()}>
          {busy ? "运转灵力……" : "发送"}
        </button>
      </form>
    </main>
  );
}
