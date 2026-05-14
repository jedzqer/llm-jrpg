import type {
  CombatLogEntry,
  CombatOutcome,
  CombatParticipant,
  CombatState,
  CombatType,
  NpcState,
  PlayerState,
  Skill,
} from "./schema";

export type CombatAction =
  | { kind: "skill"; skillId: string }
  | { kind: "flee" };

const SPAR_HP_FLOOR_RATIO = 0.1;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function getSparFloor(maxHp: number) {
  return Math.max(1, Math.ceil(maxHp * SPAR_HP_FLOOR_RATIO));
}

function clampHpForCombatType(hp: number, maxHp: number, combatType: CombatType) {
  if (combatType !== "spar") return clamp(hp, 0, maxHp);
  return clamp(hp, getSparFloor(maxHp), maxHp);
}

export function toParticipant(
  source: PlayerState | NpcState,
  fallbackId = "participant",
): CombatParticipant {
  const id = "id" in source && source.id ? source.id : fallbackId;
  const realm = source.realm ?? "凡身";
  return {
    id,
    name: source.name,
    realm,
    hp: source.hp,
    maxHp: source.maxHp,
    qi: source.qi,
    maxQi: source.maxQi,
    skills: source.skills,
  };
}

export function createCombatState(
  player: PlayerState,
  enemy: NpcState,
  combatType: CombatType,
): CombatState {
  return {
    round: 1,
    type: combatType,
    player: toParticipant(player, "player"),
    enemy: toParticipant(enemy, enemy.id || "enemy"),
    log: [
      {
        round: 1,
        actor: "system",
        text:
          combatType === "spar"
            ? `比试开始：${player.name}（${player.realm}）对阵 ${enemy.name}（${enemy.realm}），点到为止。`
            : `战起：${player.name}（${player.realm}）对阵 ${enemy.name}（${enemy.realm}）。`,
      },
    ],
    outcome: "ongoing",
  };
}

function applySkill(
  actor: CombatParticipant,
  target: CombatParticipant,
  skill: Skill,
  jitter: number,
  combatType: CombatType,
): { actor: CombatParticipant; target: CombatParticipant; text: string } {
  if (actor.qi < skill.qiCost) {
    return {
      actor,
      target,
      text: `${actor.name} 欲施「${skill.name}」，真元不继，招式散作一缕清风。`,
    };
  }
  const nextActor = { ...actor, qi: clamp(actor.qi - skill.qiCost, 0, actor.maxQi) };

  if (skill.kind === "heal") {
    const healed = skill.power + jitter;
    const updated = { ...nextActor, hp: clamp(nextActor.hp + healed, 0, nextActor.maxHp) };
    return {
      actor: updated,
      target,
      text: `${actor.name} 运转「${skill.name}」，周身泛起柔光，回复 ${healed} 点气血。`,
    };
  }

  if (skill.kind === "defend") {
    const shaved = Math.max(0, skill.power - 2 + jitter);
    const updated = { ...nextActor, hp: clamp(nextActor.hp + Math.floor(shaved / 2), 0, nextActor.maxHp) };
    return {
      actor: updated,
      target,
      text: `${actor.name} 使出「${skill.name}」，卸力之间气息稍稳。`,
    };
  }

  const dmg = Math.max(1, skill.power + jitter);
  const updatedTarget = {
    ...target,
    hp: clampHpForCombatType(target.hp - dmg, target.maxHp, combatType),
  };
  return {
    actor: nextActor,
    target: updatedTarget,
    text: `${actor.name} 施展「${skill.name}」，命中 ${target.name}，造成 ${dmg} 点伤害。`,
  };
}

function pickEnemySkill(enemy: CombatParticipant): Skill | null {
  const affordable = enemy.skills.filter((s) => enemy.qi >= s.qiCost);
  if (affordable.length === 0) return null;
  return affordable[Math.floor(Math.random() * affordable.length)];
}

function decideOutcome(state: CombatState): CombatOutcome {
  if (state.type === "spar") {
    if (state.player.hp <= getSparFloor(state.player.maxHp)) return "defeat";
    if (state.enemy.hp <= getSparFloor(state.enemy.maxHp)) return "victory";
    return "ongoing";
  }

  if (state.player.hp <= 0) return "defeat";
  if (state.enemy.hp <= 0) return "victory";
  return "ongoing";
}

function randomJitter(): number {
  return Math.floor(Math.random() * 5) - 2;
}

export function stepCombat(state: CombatState, action: CombatAction): CombatState {
  if (state.outcome !== "ongoing") return state;

  const log: CombatLogEntry[] = [...state.log];
  let player = state.player;
  let enemy = state.enemy;

  if (action.kind === "flee") {
    const escaped = Math.random() < 0.6;
    log.push({
      round: state.round,
      actor: "player",
      text: escaped
        ? `${player.name} 趁隙抽身，遁入乱阵之中。`
        : `${player.name} 试图遁走，却被 ${enemy.name} 缠住。`,
    });
    if (escaped) {
      return { ...state, player, enemy, log, outcome: "fled" };
    }
  } else {
    const skill = player.skills.find((s) => s.id === action.skillId);
    if (!skill) {
      log.push({
        round: state.round,
        actor: "system",
        text: "招式未曾习得，心神微乱。",
      });
    } else {
      const result = applySkill(player, enemy, skill, randomJitter(), state.type);
      player = result.actor;
      enemy = result.target;
      log.push({ round: state.round, actor: "player", text: result.text });
    }
  }

  let outcome = decideOutcome({ ...state, player, enemy });
  if (outcome === "ongoing") {
    const enemySkill = pickEnemySkill(enemy);
    if (!enemySkill) {
      log.push({
        round: state.round,
        actor: "enemy",
        text: `${enemy.name} 真元枯竭，喘息不定。`,
      });
    } else {
      const result = applySkill(enemy, player, enemySkill, randomJitter(), state.type);
      enemy = result.actor;
      player = result.target;
      log.push({ round: state.round, actor: "enemy", text: result.text });
    }
    outcome = decideOutcome({ ...state, player, enemy });
  }

  return {
    round: state.round + 1,
    type: state.type,
    player,
    enemy,
    log,
    outcome,
  };
}

export function outcomeSummary(state: CombatState): string {
  switch (state.outcome) {
    case "victory":
      return state.type === "spar"
        ? `${state.player.name} 在比试中压过 ${state.enemy.name}，胜负已分。`
        : `${state.player.name} 击败了 ${state.enemy.name}。`;
    case "defeat":
      return state.type === "spar"
        ? `${state.player.name} 在比试中落入下风，被 ${state.enemy.name} 逼至极限。`
        : `${state.player.name} 被 ${state.enemy.name} 击败，气血见底。`;
    case "fled":
      return `${state.player.name} 自战场中遁走。`;
    default:
      return "战斗仍在继续。";
  }
}
