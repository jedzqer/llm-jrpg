"use client";

import { useState } from "react";
import {
  CHARACTER_CREATION_TOTAL_POINTS,
  characterCreationSpiritRoots,
  defaultCharacterCreationProfile,
  type CharacterCreationProfile,
} from "@/lib/game/schema";

type SaveSlot = {
  sessionId?: string | null;
  slotIndex: number;
  updatedAt: string | null;
  playerName: string | null;
  playerRealm: string | null;
  location: string | null;
  timeLabel?: string | null;
};

type MenuMode = "root" | "load" | "create";

type Props = {
  open: boolean;
  onClose: () => void;
  globalSaveSlots: SaveSlot[];
  hasActiveProgress: boolean;
  onStartNewGame: (profile: CharacterCreationProfile) => Promise<void>;
  onLoadSave: (sessionId: string, slotIndex: number) => Promise<void>;
};

export function MainMenu({
  open,
  onClose,
  globalSaveSlots,
  hasActiveProgress,
  onStartNewGame,
  onLoadSave,
}: Props) {
  const [menuMode, setMenuMode] = useState<MenuMode>("root");
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuBusy, setMenuBusy] = useState(false);
  const [characterProfile, setCharacterProfile] = useState<CharacterCreationProfile>(
    defaultCharacterCreationProfile,
  );

  if (!open) return null;

  const visibleGlobalSaves = globalSaveSlots.filter((slot) => slot.updatedAt && slot.sessionId);
  const remainingCreationPoints =
    CHARACTER_CREATION_TOTAL_POINTS - characterProfile.maxHp - characterProfile.maxQi;

  const startNewGame = () => {
    setMenuError(null);
    setCharacterProfile(defaultCharacterCreationProfile);
    setMenuMode("create");
  };

  const confirmNewGame = async () => {
    const name = characterProfile.name.trim();
    const sect = characterProfile.sect.trim();
    const spiritRoot = characterProfile.spiritRoot.trim();

    if (!name) { setMenuError("请先为角色命名。"); return; }
    if (!sect) { setMenuError("请填写角色出身或门派。"); return; }
    if (!spiritRoot) { setMenuError("请为角色选择灵根。"); return; }
    if (remainingCreationPoints !== 0) {
      setMenuError(`初始点数必须刚好分配完毕，当前剩余 ${remainingCreationPoints} 点。`);
      return;
    }

    setMenuBusy(true);
    setMenuError(null);

    try {
      await onStartNewGame(characterProfile);
      setMenuMode("root");
    } catch (err) {
      setMenuError(err instanceof Error ? err.message : "创建新游戏失败");
    } finally {
      setMenuBusy(false);
    }
  };

  const loadMenuSave = async (targetSessionId: string, slotIndex: number) => {
    if (menuBusy) return;
    setMenuBusy(true);

    try {
      await onLoadSave(targetSessionId, slotIndex);
      setMenuMode("root");
    } catch (err) {
      setMenuError(err instanceof Error ? err.message : "读档失败");
    } finally {
      setMenuBusy(false);
    }
  };

  return (
    <section className="main-menu-overlay" aria-label="主菜单">
      <div className="main-menu-panel">
        <p className="eyebrow">LLM 修仙 · 主菜单</p>
        <h2>青云宗山门</h2>
        <p className="main-menu-lede">
          {menuMode === "root"
            ? "选择一条路。可以自此开新局，也可以从旧日存档续上因果。"
            : menuMode === "load"
              ? "从已有存档中择一卷入局。读取后会回到该会话对应的时间点。"
              : "先定下姓名、门庭与灵根，再把初始点数分到气血和灵力上，这一局才会真正落地。"}
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
              <button type="button" className="button main-menu-button" onClick={onClose}>
                返回游戏
              </button>
            )}
          </div>
        ) : menuMode === "load" ? (
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
        ) : (
          <CharacterCreateForm
            profile={characterProfile}
            onChange={setCharacterProfile}
            remainingPoints={remainingCreationPoints}
            busy={menuBusy}
            error={menuError}
            onSubmit={() => void confirmNewGame()}
            onBack={() => { setMenuError(null); setMenuMode("root"); }}
          />
        )}
      </div>
    </section>
  );
}

function CharacterCreateForm({
  profile,
  onChange,
  remainingPoints,
  busy,
  error,
  onSubmit,
  onBack,
}: {
  profile: CharacterCreationProfile;
  onChange: (p: CharacterCreationProfile) => void;
  remainingPoints: number;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <form
      className="character-create-form"
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
    >
      <div className="character-create-grid">
        <label className="field">
          <span>角色姓名</span>
          <input
            value={profile.name}
            onChange={(e) => onChange({ ...profile, name: e.target.value })}
            placeholder="例如：叶惊鸿"
            disabled={busy}
          />
        </label>
        <label className="field">
          <span>出身或门派</span>
          <input
            value={profile.sect}
            onChange={(e) => onChange({ ...profile, sect: e.target.value })}
            placeholder="例如：青云宗外门弟子"
            disabled={busy}
          />
        </label>
        <label className="field field-full">
          <span>灵根</span>
          <select
            value={profile.spiritRoot}
            onChange={(e) => onChange({ ...profile, spiritRoot: e.target.value })}
            disabled={busy}
          >
            {characterCreationSpiritRoots.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="field field-full">
          <span>出身经历</span>
          <textarea
            value={profile.backstory}
            onChange={(e) => onChange({ ...profile, backstory: e.target.value })}
            placeholder="例如：世家子弟，自幼修习剑道；或：孤儿流浪，偶得残卷入道……"
            rows={3}
            disabled={busy}
          />
        </label>
      </div>

      <section className="character-stat-panel">
        <div className="character-stat-head">
          <div>
            <p className="eyebrow">初始加点</p>
            <strong>总计 {CHARACTER_CREATION_TOTAL_POINTS} 点</strong>
          </div>
          <span className={remainingPoints === 0 ? "character-points-ok" : "character-points-left"}>
            {remainingPoints === 0 ? "点数已分配完毕" : `剩余 ${remainingPoints} 点待分配`}
          </span>
        </div>

        <div className="character-stat-grid">
          <label className="field">
            <span>气血上限</span>
            <input
              type="number"
              min={1}
              max={CHARACTER_CREATION_TOTAL_POINTS - 1}
              value={profile.maxHp}
              onChange={(e) => onChange({ ...profile, maxHp: Number(e.target.value) || 0 })}
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>灵力上限</span>
            <input
              type="number"
              min={1}
              max={CHARACTER_CREATION_TOTAL_POINTS - 1}
              value={profile.maxQi}
              onChange={(e) => onChange({ ...profile, maxQi: Number(e.target.value) || 0 })}
              disabled={busy}
            />
          </label>
        </div>
        <p className="save-meta">建议气血与灵力至少各保留 12 点，否则开局容错会很低。</p>
      </section>

      {error && <p className="chat-error">{error}</p>}

      <div className="character-create-actions">
        <button type="submit" className="button primary main-menu-button" disabled={busy}>
          {busy ? "开局中……" : "确认开局"}
        </button>
        <button type="button" className="button main-menu-button" onClick={onBack} disabled={busy}>
          返回
        </button>
      </div>
    </form>
  );
}

