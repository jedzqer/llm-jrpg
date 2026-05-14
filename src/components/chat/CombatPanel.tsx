"use client";

import { useState } from "react";
import { createCombatState, outcomeSummary, stepCombat } from "@/lib/game/combat";
import type { CombatOutcome, CombatState, CombatType, NpcState, PlayerState } from "@/lib/game/schema";

type Props = {
  player: PlayerState;
  enemy: NpcState;
  combatType: CombatType;
  triggerDescription: string;
  onFinish: (result: {
    outcome: CombatOutcome;
    summary: string;
    player: Pick<PlayerState, "hp" | "maxHp" | "qi" | "maxQi">;
    enemy: Pick<NpcState, "id" | "hp" | "maxHp" | "qi" | "maxQi">;
  }) => void;
};

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="combat-bar-track">
      <div className="combat-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function ParticipantCard({
  name,
  realm,
  hp,
  maxHp,
  qi,
  maxQi,
  side,
}: {
  name: string;
  realm: string;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  side: "player" | "enemy";
}) {
  return (
    <div className={`combat-card combat-card-${side}`}>
      <div className="combat-card-name">{name}</div>
      <div className="combat-card-realm">{realm}</div>
      <div className="combat-stat-row">
        <span className="combat-stat-label">气血</span>
        <Bar value={hp} max={maxHp} color="var(--combat-hp)" />
        <span className="combat-stat-num">
          {hp}/{maxHp}
        </span>
      </div>
      <div className="combat-stat-row">
        <span className="combat-stat-label">灵力</span>
        <Bar value={qi} max={maxQi} color="var(--combat-qi)" />
        <span className="combat-stat-num">
          {qi}/{maxQi}
        </span>
      </div>
    </div>
  );
}

export function CombatPanel({ player, enemy, combatType, triggerDescription, onFinish }: Props) {
  const [combat, setCombat] = useState<CombatState>(() =>
    createCombatState(player, enemy, combatType),
  );
  const [finished, setFinished] = useState(false);

  const handleAction = (kind: "skill" | "flee", skillId?: string) => {
    if (combat.outcome !== "ongoing" || finished) return;
    const next = stepCombat(
      combat,
      kind === "flee" ? { kind: "flee" } : { kind: "skill", skillId: skillId! },
    );
    setCombat(next);
    if (next.outcome !== "ongoing") {
      setFinished(true);
    }
  };

  const handleConfirm = () => {
    const summary = outcomeSummary(combat);
    onFinish({
      outcome: combat.outcome,
      summary,
      player: {
        hp: combat.player.hp,
        maxHp: combat.player.maxHp,
        qi: combat.player.qi,
        maxQi: combat.player.maxQi,
      },
      enemy: {
        id: combat.enemy.id,
        hp: combat.enemy.hp,
        maxHp: combat.enemy.maxHp,
        qi: combat.enemy.qi,
        maxQi: combat.enemy.maxQi,
      },
    });
  };

  const latestLogs = combat.log.slice(-6);

  return (
    <div className="combat-panel">
      <div className="combat-trigger">{triggerDescription}</div>

      <div className="combat-participants">
        <ParticipantCard
          name={combat.player.name}
          realm={combat.player.realm}
          hp={combat.player.hp}
          maxHp={combat.player.maxHp}
          qi={combat.player.qi}
          maxQi={combat.player.maxQi}
          side="player"
        />
        <div className="combat-vs">VS</div>
        <ParticipantCard
          name={combat.enemy.name}
          realm={combat.enemy.realm}
          hp={combat.enemy.hp}
          maxHp={combat.enemy.maxHp}
          qi={combat.enemy.qi}
          maxQi={combat.enemy.maxQi}
          side="enemy"
        />
      </div>

      <div className="combat-log" aria-live="polite">
        {latestLogs.map((entry, i) => (
          <p
            key={i}
            className={`combat-log-line combat-log-${entry.actor}`}
          >
            {entry.text}
          </p>
        ))}
      </div>

      {combat.outcome === "ongoing" ? (
        <div className="combat-actions">
          {combat.player.skills.map((skill) => (
            <button
              key={skill.id}
              className="button combat-skill-btn"
              onClick={() => handleAction("skill", skill.id)}
              disabled={combat.player.qi < skill.qiCost}
              title={`${skill.description}（灵力消耗：${skill.qiCost}）`}
            >
              <span className="skill-name">{skill.name}</span>
              <span className="skill-cost">灵力 -{skill.qiCost}</span>
            </button>
          ))}
          <button
            className="button combat-flee-btn"
            onClick={() => handleAction("flee")}
          >
            遁走
          </button>
        </div>
      ) : (
        <div className="combat-result">
          <p className="combat-outcome-text">{outcomeSummary(combat)}</p>
          <button className="button primary" onClick={handleConfirm}>
            继续剧情
          </button>
        </div>
      )}
    </div>
  );
}
