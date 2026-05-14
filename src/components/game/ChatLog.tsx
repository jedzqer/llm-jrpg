"use client";

import { useEffect, useRef } from "react";
import { type UIMessage, type InferUITools } from "ai";
import { CombatPanel } from "@/components/chat/CombatPanel";
import { RichText } from "@/components/chat/RichText";
import { gameTools } from "@/lib/ai/tools";
import { formatWorldTime, type WorldState } from "@/lib/game/schema";

type GameUIMessage = UIMessage<never, Record<string, unknown>, InferUITools<typeof gameTools>>;

function getMessageStatusSnapshot(message: GameUIMessage, fallback: WorldState) {
  const statusPart = [...message.parts]
    .reverse()
    .find((part) => part.type === "tool-updateWorldState" && part.state === "output-available") as
    | { output?: { snapshot?: { location: string; scene: string; time: WorldState["time"] } } }
    | undefined;

  return (
    statusPart?.output?.snapshot ?? {
      location: fallback.location,
      scene: fallback.scene,
      time: fallback.time,
    }
  );
}

type CombatResult = {
  outcome: "victory" | "defeat" | "fled";
  summary: string;
  player: { hp: number; maxHp: number; qi: number; maxQi: number };
  enemy: { id: string; hp: number; maxHp: number; qi: number; maxQi: number };
};

type Props = {
  messages: GameUIMessage[];
  worldState: WorldState;
  historyLoaded: boolean;
  worldLoaded: boolean;
  configReady: boolean;
  playerDead: boolean;
  bootError: string | null;
  chatError: Error | undefined;
  onCombatFinish: (toolCallId: string, result: CombatResult) => void;
};

export function ChatLog({
  messages,
  worldState,
  historyLoaded,
  worldLoaded,
  configReady,
  playerDead,
  bootError,
  chatError,
  onCombatFinish,
}: Props) {
  const logRef = useRef<HTMLElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <section className="chat-log" aria-live="polite" ref={logRef}>
      {!historyLoaded && <p className="chat-empty">正在回溯此前的因果……</p>}
      {!worldLoaded && <p className="chat-empty">正在载入当前命盘……</p>}
      {bootError && <p className="chat-error">会话读取失败：{bootError}</p>}
      {!configReady && (
        <p className="chat-empty">先在上方填写并保存模型配置，之后才能开始对话。</p>
      )}
      {playerDead && (
        <p className="chat-error">你已身死道消，当前只能读档重来。请先点击上方「读档」。</p>
      )}
      {messages.length === 0 && (
        <p className="chat-empty">先开口说点什么，或者做点什么。比如「上前行礼，通报姓名」。</p>
      )}
      {messages.map((m) => {
        const isSystemMsg = m.role === "user" && m.parts.some(
          (p) => p.type === "text" && p.text.startsWith("[系统]"),
        );
        if (isSystemMsg) return null;

        return (
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

                if (part.type === "tool-updateWorldState") return null;

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
                          onCombatFinish(part.toolCallId, { ...result, outcome: finalOutcome });
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

                if (part.type === "tool-giveItem") {
                  if (part.state === "output-available") {
                    const out = part.output as { summary: string };
                    return (
                      <p key={`${m.id}-${i}`} className="item-gained">
                        {out.summary}
                      </p>
                    );
                  }
                  return null;
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
        );
      })}
      {chatError && <p className="chat-error">出了点岔子：{chatError.message}</p>}
    </section>
  );
}
