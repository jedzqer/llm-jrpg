"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  InferUITools,
  lastAssistantMessageIsCompleteWithToolCalls,
  UIMessage,
} from "ai";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { MainMenu } from "@/components/game/MainMenu";
import { PlayerSidebar } from "@/components/game/PlayerSidebar";
import { SettingsPanel, type ConfigState } from "@/components/game/SettingsPanel";
import { ChatLog } from "@/components/game/ChatLog";
import {
  createSessionId,
  getOrCreateSessionId,
  setStoredSessionId,
} from "@/lib/chat/session";
import { gameTools, type WorldStateChangeInput, type GiveItemInput } from "@/lib/ai/tools";
import {
  createStarterWorldState,
  formatWorldTime,
  normalizeWorldState,
  type CharacterCreationProfile,
  type ItemDef,
  type WorldState,
} from "@/lib/game/schema";

type GameUIMessage = UIMessage<never, Record<string, unknown>, InferUITools<typeof gameTools>>;

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

async function persistWorldState(sessionId: string, worldState: WorldState) {
  const res = await fetch("/api/world", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, worldState }),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error || "保存世界状态失败");
  }
}

function reconcileItem(
  registry: ItemDef[],
  incoming: GiveItemInput["item"],
): { item: ItemDef; corrected: boolean } {
  const existing = registry.find((d) => d.id === incoming.id);
  if (!existing) {
    return { item: incoming as ItemDef, corrected: false };
  }
  const same =
    existing.name === incoming.name &&
    existing.usage === incoming.usage &&
    existing.consumable === incoming.consumable &&
    JSON.stringify(existing.effects) === JSON.stringify(incoming.effects);
  return { item: existing, corrected: !same };
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
  if (previous.location !== next.location) changes.push(`地点变更为 ${next.location}`);
  if (
    previous.time.day !== next.time.day ||
    previous.time.phase !== next.time.phase ||
    previous.time.clock !== next.time.clock
  ) {
    changes.push(`时间推进至 ${formatWorldTime(next.time)}`);
  }
  if (previous.scene !== next.scene) changes.push(`场景更新为 ${next.scene}`);
  if (previous.activeQuest.stage !== next.activeQuest.stage)
    changes.push(`任务阶段变更为 ${next.activeQuest.stage}`);
  if (previous.activeQuest.objective !== next.activeQuest.objective)
    changes.push(`任务目标更新为 ${next.activeQuest.objective}`);
  return changes.join("；") || "世界状态未发生可见变化";
}

// --- PLACEHOLDER_HOME ---

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
  const [bootError, setBootError] = useState<string | null>(null);
  const [loadPhase, setLoadPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [configState, setConfigState] = useState<ConfigState>({ loaded: false, hasSavedApiKey: false, modelId: "" });
  const [saveLoadStatus, setSaveLoadStatus] = useState<"idle" | "saving" | "loading">("idle");
  const [activeSlotIndex, setActiveSlotIndex] = useState(1);
  const [saveSlots, setSaveSlots] = useState<SaveStatusResponse["saveSlots"]>(emptySaveSlots);
  const [globalSaveSlots, setGlobalSaveSlots] = useState<SaveStatusResponse["saveSlots"]>([]);
  const pendingInitRef = useRef(false);
  const appliedWorldToolCallsRef = useRef(new Set<string>());
  const appliedGiveItemCallsRef = useRef(new Set<string>());

  const { messages, setMessages, sendMessage, status, error, addToolOutput } =
    useChat<GameUIMessage>({
      id: sessionId || undefined,
      transport: new DefaultChatTransport({
        api: "/api/chat",
        body: sessionId ? { sessionId } : undefined,
      }),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    });

  // Load global save slots on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/save");
        if (!res.ok) throw new Error("读取全局存档失败");
        const data = (await res.json()) as SaveStatusResponse;
        if (!cancelled) setGlobalSaveSlots(Array.isArray(data.saveSlots) ? data.saveSlots : []);
      } catch (err) {
        if (!cancelled) setBootError(err instanceof Error ? err.message : "读取全局存档失败");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  // Load session data when sessionId changes
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let completedCount = 0;
    let hadError = false;

    setLoadPhase("loading");

    const onSubTaskDone = (error?: string) => {
      if (cancelled) return;
      if (error) { hadError = true; setBootError(error); }
      completedCount += 1;
      if (completedCount === 2) setLoadPhase(hadError ? "error" : "ready");
    };

    const loadHistory = async () => {
      try {
        const res = await fetch(`/api/chat?sessionId=${encodeURIComponent(sessionId)}`);
        if (!res.ok) throw new Error("加载历史对话失败");
        const data = (await res.json()) as { messages?: GameUIMessage[] };
        if (!cancelled && Array.isArray(data.messages)) setMessages(data.messages);
        onSubTaskDone();
      } catch (err) {
        onSubTaskDone(err instanceof Error ? err.message : "加载历史对话失败");
      }
    };

    const loadWorld = async () => {
      try {
        const res = await fetch(`/api/world?sessionId=${encodeURIComponent(sessionId)}`);
        if (!res.ok) throw new Error("加载世界状态失败");
        const data = (await res.json()) as { worldState?: WorldState };
        if (!cancelled && data.worldState) setWorldState(normalizeWorldState(data.worldState));
        onSubTaskDone();
      } catch (err) {
        onSubTaskDone(err instanceof Error ? err.message : "加载世界状态失败");
      }
    };

    const loadSaveStatus = async () => {
      try {
        const res = await fetch(`/api/save?sessionId=${encodeURIComponent(sessionId)}`);
        if (!res.ok) throw new Error("读取存档状态失败");
        const data = (await res.json()) as SaveStatusResponse;
        if (!cancelled) setSaveSlots(Array.isArray(data.saveSlots) ? data.saveSlots : []);
      } catch (err) {
        if (!cancelled) setBootError(err instanceof Error ? err.message : "读取存档状态失败");
      }
    };

    void loadHistory();
    void loadWorld();
    void loadSaveStatus();
    return () => { cancelled = true; };
  }, [sessionId, setMessages]);

  // Auto-send init message after new game creation
  useEffect(() => {
    if (!pendingInitRef.current || loadPhase !== "ready" || !sessionId) return;
    pendingInitRef.current = false;
    sendMessage({ text: "[系统] 角色初始化" });
  }, [loadPhase, sessionId, sendMessage]);

  // PLACEHOLDER_EFFECTS

  // Process tool calls — single effect chains nextWorldState through both passes to prevent overwrite race
  useEffect(() => {
    if (!sessionId) return;

    const pendingWorldUpdates = messages.flatMap((message) =>
      message.parts.flatMap((part) => {
        if (part.type !== "tool-updateWorldState" || part.state !== "input-available") return [];
        if (appliedWorldToolCallsRef.current.has(part.toolCallId)) return [];
        return [{ toolCallId: part.toolCallId, input: part.input as WorldStateChangeInput }];
      }),
    );

    const pendingGiveItems = messages.flatMap((message) =>
      message.parts.flatMap((part) => {
        if (part.type !== "tool-giveItem" || part.state !== "input-available") return [];
        if (appliedGiveItemCallsRef.current.has(part.toolCallId)) return [];
        return [{ toolCallId: part.toolCallId, input: part.input as GiveItemInput }];
      }),
    );

    if (pendingWorldUpdates.length === 0 && pendingGiveItems.length === 0) return;
    if (!worldState) return;

    let nextWorldState = worldState;

    const worldOutputs = pendingWorldUpdates.map(({ toolCallId, input }) => {
      appliedWorldToolCallsRef.current.add(toolCallId);
      const prev = nextWorldState;
      nextWorldState = applyWorldStateChange(nextWorldState, input);
      return {
        toolCallId,
        output: {
          summary: summarizeWorldStateChange(prev, nextWorldState),
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

    const giveItemOutputs = pendingGiveItems.map(({ toolCallId, input }) => {
      appliedGiveItemCallsRef.current.add(toolCallId);
      const { item: resolvedItem, corrected } = reconcileItem(nextWorldState.itemRegistry, input.item);
      const newRegistry = nextWorldState.itemRegistry.find((d) => d.id === resolvedItem.id)
        ? nextWorldState.itemRegistry
        : [...nextWorldState.itemRegistry, resolvedItem];
      const existingEntry = nextWorldState.player.inventory.find((e) => e.itemId === resolvedItem.id);
      const newInventory = existingEntry
        ? nextWorldState.player.inventory.map((e) =>
            e.itemId === resolvedItem.id ? { ...e, quantity: e.quantity + input.quantity } : e,
          )
        : [...nextWorldState.player.inventory, { itemId: resolvedItem.id, quantity: input.quantity }];
      nextWorldState = { ...nextWorldState, itemRegistry: newRegistry, player: { ...nextWorldState.player, inventory: newInventory } };
      const summary = corrected
        ? `获得「${resolvedItem.name}」×${input.quantity}（参数已按已有定义修正）`
        : `获得「${resolvedItem.name}」×${input.quantity}`;
      return { toolCallId, output: { accepted: true, summary, corrected } };
    });

    setWorldState(nextWorldState);
    for (const { toolCallId, output } of worldOutputs) {
      addToolOutput({ tool: "updateWorldState", toolCallId, output });
    }
    for (const { toolCallId, output } of giveItemOutputs) {
      addToolOutput({ tool: "giveItem", toolCallId, output });
    }
    void persistWorldState(sessionId, nextWorldState).catch((err) => {
      setBootError(err instanceof Error ? err.message : "保存世界状态失败");
    });
  }, [messages, sessionId, worldState, addToolOutput]);

  // PLACEHOLDER_HANDLERS

  const busy = status === "streaming" || status === "submitted";
  const playerDead = worldState !== null && worldState.player.hp <= 0;
  const activeSlot = saveSlots.find((slot) => slot.slotIndex === activeSlotIndex);
  const activeSlotHasSave = Boolean(activeSlot?.updatedAt);
  const historyLoaded = loadPhase !== "idle" && loadPhase !== "loading";
  const worldLoaded = loadPhase !== "idle" && loadPhase !== "loading";
  const chatReady =
    loadPhase === "ready" && worldState !== null && configState.loaded && configState.hasSavedApiKey &&
    Boolean(configState.modelId.trim()) && !playerDead;
  const hasActiveProgress = messages.length > 0 || saveSlots.some((slot) => Boolean(slot.updatedAt));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || !sessionId || !chatReady) return;
    sendMessage({ text });
    setInput("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(e); }
  };

  const handleUseItem = (itemId: string) => {
    if (busy || !sessionId || !chatReady || !worldState) return;
    const entry = worldState.player.inventory.find((e) => e.itemId === itemId);
    const def = worldState.itemRegistry.find((d) => d.id === itemId);
    if (!entry || !def || def.usage !== "panel") return;

    let nextPlayer = { ...worldState.player };
    const effectParts: string[] = [];
    for (const effect of def.effects) {
      const prev = nextPlayer[effect.stat];
      let next = prev + effect.delta;
      if (effect.stat === "hp") next = Math.min(next, nextPlayer.maxHp);
      if (effect.stat === "qi") next = Math.min(next, nextPlayer.maxQi);
      next = Math.max(next, 0);
      nextPlayer = { ...nextPlayer, [effect.stat]: next };
      const statLabel = { hp: "气血", qi: "灵力", maxHp: "气血上限", maxQi: "灵力上限" }[effect.stat];
      const sign = effect.delta > 0 ? "+" : "";
      effectParts.push(`${statLabel} ${sign}${effect.delta}`);
    }
    if (def.consumable) {
      const newQty = entry.quantity - 1;
      nextPlayer = {
        ...nextPlayer,
        inventory: newQty > 0
          ? nextPlayer.inventory.map((e) => e.itemId === itemId ? { ...e, quantity: newQty } : e)
          : nextPlayer.inventory.filter((e) => e.itemId !== itemId),
      };
    }
    const nextWorldState = { ...worldState, player: nextPlayer };
    setWorldState(nextWorldState);
    void persistWorldState(sessionId, nextWorldState).catch((err) => {
      setBootError(err instanceof Error ? err.message : "保存世界状态失败");
    });
    sendMessage({ text: `[系统] 你使用了「${def.name}」。效果：${effectParts.join("，")}。` });
  };

  const refreshGlobalSaves = async () => {
    const res = await fetch("/api/save");
    if (!res.ok) throw new Error("读取全局存档失败");
    const data = (await res.json()) as SaveStatusResponse;
    setGlobalSaveSlots(Array.isArray(data.saveSlots) ? data.saveSlots : []);
  };

  const saveGame = async (slotIndex: number) => {
    if (!sessionId || busy || saveLoadStatus !== "idle") return;
    setSaveLoadStatus("saving");
    setBootError(null);
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, slotIndex }),
      });
      const data = (await res.json()) as SaveStatusResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "存档失败");
      setActiveSlotIndex(slotIndex);
      setSaveSlots(Array.isArray(data.saveSlots) ? data.saveSlots : []);
      await refreshGlobalSaves();
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "存档失败");
    } finally {
      setSaveLoadStatus("idle");
    }
  };

  const loadGame = async (slotIndex: number) => {
    const slot = saveSlots.find((item) => item.slotIndex === slotIndex);
    if (!sessionId || busy || saveLoadStatus !== "idle" || !slot?.updatedAt) return;
    setSaveLoadStatus("loading");
    setBootError(null);
    try {
      const res = await fetch("/api/save", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, slotIndex }),
      });
      const data = (await res.json()) as {
        error?: string; messages?: GameUIMessage[]; worldState?: WorldState;
        saveSlots?: SaveStatusResponse["saveSlots"];
      };
      if (!res.ok || !data.messages || !data.worldState) throw new Error(data.error || "读档失败");
      setActiveSlotIndex(slotIndex);
      setMessages(data.messages);
      setWorldState(normalizeWorldState(data.worldState));
      setSaveSlots(Array.isArray(data.saveSlots) ? data.saveSlots : []);
      await refreshGlobalSaves();
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "读档失败");
    } finally {
      setSaveLoadStatus("idle");
    }
  };

  // PLACEHOLDER_COMBAT_AND_MENU

  const handleCombatFinish = async (
    toolCallId: string,
    result: {
      outcome: "victory" | "defeat" | "fled";
      summary: string;
      player: { hp: number; maxHp: number; qi: number; maxQi: number };
      enemy: { id: string; hp: number; maxHp: number; qi: number; maxQi: number };
    },
  ) => {
    if (!sessionId || !worldState) return;
    const nextNpc =
      worldState.activeNpc.id === result.enemy.id
        ? { ...worldState.activeNpc, hp: result.enemy.hp, maxHp: result.enemy.maxHp, qi: result.enemy.qi, maxQi: result.enemy.maxQi }
        : worldState.activeNpc;
    const nextWorldState: WorldState = {
      ...worldState,
      player: { ...worldState.player, hp: result.player.hp, maxHp: result.player.maxHp, qi: result.player.qi, maxQi: result.player.maxQi },
      activeNpc: nextNpc,
    };
    setWorldState(normalizeWorldState(nextWorldState));
    try { await persistWorldState(sessionId, normalizeWorldState(nextWorldState)); }
    catch (err) { setBootError(err instanceof Error ? err.message : "保存世界状态失败"); }
    addToolOutput({ tool: "startCombat", toolCallId, output: { outcome: result.outcome, summary: result.summary, player: result.player, enemy: result.enemy } });
  };

  const handleConfigChanged = useCallback((state: ConfigState) => {
    setConfigState(state);
  }, []);

  const handleStartNewGame = async (profile: CharacterCreationProfile) => {
    const nextSessionId = createSessionId();
    if (!nextSessionId) throw new Error("无法生成会话 ID");
    const nextWorldState = createStarterWorldState({
      name: profile.name.trim(),
      sect: profile.sect.trim(),
      spiritRoot: profile.spiritRoot.trim(),
      backstory: profile.backstory,
      maxHp: profile.maxHp,
      maxQi: profile.maxQi,
    });
    await persistWorldState(nextSessionId, nextWorldState);
    setStoredSessionId(nextSessionId);
    appliedWorldToolCallsRef.current.clear();
    appliedGiveItemCallsRef.current.clear();
    setSessionId(nextSessionId);
    setWorldState(nextWorldState);
    setInput("");
    setActiveSlotIndex(1);
    setSaveSlots(emptySaveSlots);
    setBootError(null);
    setLoadPhase("ready");
    setMenuOpen(false);
    pendingInitRef.current = true;
  };

  const handleLoadSave = async (targetSessionId: string, slotIndex: number) => {
    const res = await fetch("/api/save", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: targetSessionId, slotIndex }),
    });
    const data = (await res.json()) as {
      error?: string; messages?: GameUIMessage[]; worldState?: WorldState;
      saveSlots?: SaveStatusResponse["saveSlots"];
    };
    if (!res.ok || !data.messages || !data.worldState) throw new Error(data.error || "读档失败");
    setStoredSessionId(targetSessionId);
    appliedWorldToolCallsRef.current.clear();
    appliedGiveItemCallsRef.current.clear();
    setSessionId(targetSessionId);
    setMessages(data.messages);
    setWorldState(normalizeWorldState(data.worldState));
    setSaveSlots(Array.isArray(data.saveSlots) ? data.saveSlots : []);
    setInput("");
    setActiveSlotIndex(slotIndex);
    setMenuOpen(false);
    await refreshGlobalSaves();
  };

  // PLACEHOLDER_RETURN

  return (
    <main className="chat-shell">
      <MainMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        globalSaveSlots={globalSaveSlots}
        hasActiveProgress={hasActiveProgress}
        onStartNewGame={handleStartNewGame}
        onLoadSave={handleLoadSave}
      />

      <PlayerSidebar
        worldState={worldState}
        busy={busy}
        onUseItem={handleUseItem}
      />

      <div className="chat-main">
        <header className="chat-header">
          <div className="chat-header-top">
            <div>
              <p className="eyebrow">LLM 修仙 · 原型</p>
              <h1>青云宗 · 外门</h1>
            </div>
            <div className="header-actions">
              <button type="button" className="button" onClick={() => setMenuOpen(true)}>
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
                      disabled={!sessionId || busy || saveLoadStatus !== "idle"}
                    >
                      {saveLoadStatus === "saving" && activeSlotIndex === slot.slotIndex ? "存档中……" : "存档"}
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => void loadGame(slot.slotIndex)}
                      disabled={!sessionId || busy || saveLoadStatus !== "idle" || !slot.updatedAt}
                    >
                      {saveLoadStatus === "loading" && activeSlotIndex === slot.slotIndex ? "读档中……" : "读档"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </header>

        <SettingsPanel open={settingsOpen} onConfigChanged={handleConfigChanged} />

        <ChatLog
          messages={messages}
          worldState={worldState}
          historyLoaded={historyLoaded}
          worldLoaded={worldLoaded}
          configReady={configState.loaded && configState.hasSavedApiKey && Boolean(configState.modelId.trim())}
          playerDead={playerDead}
          bootError={bootError}
          chatError={error}
          onCombatFinish={handleCombatFinish}
        />

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
