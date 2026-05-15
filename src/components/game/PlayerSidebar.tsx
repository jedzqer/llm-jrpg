"use client";

import {
  formatWorldTime,
  type ItemDef,
  type WorldState,
} from "@/lib/game/schema";

type Props = {
  worldState: WorldState | null;
  busy: boolean;
  onUseItem: (itemId: string) => void;
};

export function PlayerSidebar({ worldState, busy, onUseItem }: Props) {
  if (!worldState) {
    return (
      <aside className="player-sidebar">
        <section className="player-panel">
          <p className="chat-empty">尚未创建角色</p>
        </section>
      </aside>
    );
  }

  const { player } = worldState;
  return (
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
            <strong>{player.hp} / {player.maxHp}</strong>
          </div>
          <div className="player-stat-track">
            <div className="player-stat-fill hp" style={{ width: `${(player.hp / player.maxHp) * 100}%` }} />
          </div>
        </div>

        <div className="player-stat-block">
          <div className="player-stat-head">
            <span>灵力</span>
            <strong>{player.qi} / {player.maxQi}</strong>
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
            <p>{worldState.location}</p>
            <strong>{formatWorldTime(worldState.time)}</strong>
            <span>{worldState.scene}</span>
          </div>
        </section>

        <section className="player-section">
          <div className="player-section-head">
            <span className="eyebrow">随身物品</span>
          </div>
          <ul className="token-list">
            {player.inventory.map((entry) => {
              const def = worldState.itemRegistry.find((d: ItemDef) => d.id === entry.itemId);
              const label = def ? `${def.name}×${entry.quantity}` : `${entry.itemId}×${entry.quantity}`;
              const canUse = def?.usage === "panel" && !busy;
              return (
                <li key={entry.itemId} className="token-item" title={def?.description}>
                  <span>{label}</span>
                  {canUse && (
                    <button className="item-use-btn" onClick={() => onUseItem(entry.itemId)}>
                      使用
                    </button>
                  )}
                </li>
              );
            })}
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
  );
}
