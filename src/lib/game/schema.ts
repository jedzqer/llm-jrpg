export type SkillKind = "attack" | "defend" | "heal";

export type Skill = {
  id: string;
  name: string;
  description: string;
  qiCost: number;
  power: number;
  kind: SkillKind;
};

export type PlayerState = {
  name: string;
  realm: string;
  sect: string;
  spiritRoot: string;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  inventory: string[];
  skills: Skill[];
};

export type NpcDisposition = "hostile" | "guarded" | "neutral" | "curious" | "allied";

export type NpcState = {
  id: string;
  name: string;
  title: string;
  motive: string;
  disposition: NpcDisposition;
  realm: string;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  inventory: string[];
  skills: Skill[];
};

export type QuestState = {
  id: string;
  title: string;
  stage: string;
  objective: string;
};

export type WorldTime = {
  day: number;
  phase: string;
  clock: string;
};

export type WorldState = {
  era: string;
  location: string;
  scene: string;
  time: WorldTime;
  player: PlayerState;
  activeNpc: NpcState;
  activeQuest: QuestState;
};

export type CombatType = "spar" | "lethal";

export type CombatOutcome = "ongoing" | "victory" | "defeat" | "fled";

export type CombatParticipant = {
  id: string;
  name: string;
  realm: string;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  skills: Skill[];
};

export type CombatLogEntry = {
  round: number;
  actor: "player" | "enemy" | "system";
  text: string;
};

export type CombatState = {
  round: number;
  type: CombatType;
  player: CombatParticipant;
  enemy: CombatParticipant;
  log: CombatLogEntry[];
  outcome: CombatOutcome;
};

export type CharacterCreationProfile = {
  name: string;
  sect: string;
  spiritRoot: string;
  maxHp: number;
  maxQi: number;
};

export const CHARACTER_CREATION_TOTAL_POINTS = 36;
export const CHARACTER_CREATION_MIN_HP = 12;
export const CHARACTER_CREATION_MIN_QI = 12;
export const characterCreationSpiritRoots = [
  "金灵根",
  "木灵根",
  "水灵根",
  "火灵根",
  "土灵根",
  "风灵根",
  "雷灵根",
  "双灵根",
  "三灵根",
] as const;

const playerSkills: Skill[] = [
  {
    id: "qingyun-jianjue",
    name: "青云剑诀·初式",
    description: "引气御剑，直刺对手要害。",
    qiCost: 3,
    power: 6,
    kind: "attack",
  },
  {
    id: "liuyun-bufa",
    name: "流云步",
    description: "身形一晃卸去来势，短暂提高闪避。",
    qiCost: 2,
    power: 4,
    kind: "defend",
  },
  {
    id: "xiaozhoutian",
    name: "小周天导气",
    description: "运转周天，回复气血。",
    qiCost: 4,
    power: 6,
    kind: "heal",
  },
];

export const starterWorldTime: WorldTime = {
  day: 1,
  phase: "子夜将尽",
  clock: "04:15",
};

const baseStarterWorldState: WorldState = {
  era: "灵气复苏第三百年，九州列国林立，正邪仙门对峙。",
  location: "青云宗·外门",
  scene: "演武场试炼初日，夜雨初霁，青石泛着湿光。",
  time: starterWorldTime,
  player: {
    name: "无名修士",
    realm: "炼气一层",
    sect: "未入宗散修",
    spiritRoot: "灵根未定",
    hp: CHARACTER_CREATION_MIN_HP,
    maxHp: CHARACTER_CREATION_MIN_HP,
    qi: CHARACTER_CREATION_MIN_QI,
    maxQi: CHARACTER_CREATION_MIN_QI,
    inventory: ["下品灵石×2", "回气散×1", "外门木牌"],
    skills: playerSkills,
  },
  activeNpc: {
    id: "zhishi-lin-wanyu",
    name: "林挽玉",
    title: "青云宗外门执事",
    motive: "甄选堪造之材，暗中追查你袖中那枚青铜铃的来历。",
    disposition: "guarded",
    realm: "筑基六层",
    hp: 60,
    maxHp: 60,
    qi: 50,
    maxQi: 50,
    inventory: ["青锋长剑", "定神符×3"],
    skills: [
      {
        id: "linwanyu-qingfeng",
        name: "青锋破云",
        description: "长剑劈下，剑气破空。",
        qiCost: 5,
        power: 10,
        kind: "attack",
      },
    ],
  },
  activeQuest: {
    id: "waimen-shilian-chuqi",
    title: "外门试炼·初阶",
    stage: "开场",
    objective: "在林挽玉执事主持的首轮比试中立足，争取下月宗门任务的名额。",
  },
};

export const defaultCharacterCreationProfile: CharacterCreationProfile = {
  name: "",
  sect: "青云宗外门弟子",
  spiritRoot: "双灵根",
  maxHp: 18,
  maxQi: 18,
};

export function createStarterWorldState(profile: CharacterCreationProfile): WorldState {
  return {
    ...structuredClone(baseStarterWorldState),
    player: {
      ...structuredClone(baseStarterWorldState.player),
      name: profile.name.trim(),
      sect: profile.sect.trim(),
      spiritRoot: profile.spiritRoot.trim(),
      hp: profile.maxHp,
      maxHp: profile.maxHp,
      qi: profile.maxQi,
      maxQi: profile.maxQi,
    },
    activeNpc: {
      ...structuredClone(baseStarterWorldState.activeNpc),
      motive: `甄选可造之材，顺便观察新入门的 ${profile.name.trim()} 是否值得进一步留意。`,
    },
    activeQuest: {
      ...structuredClone(baseStarterWorldState.activeQuest),
      objective: `以新弟子 ${profile.name.trim()} 的身份通过首轮试炼，在青云宗外门站稳脚跟。`,
    },
  };
}

export const starterWorldState: WorldState = createStarterWorldState({
  ...defaultCharacterCreationProfile,
  name: "沈惊蛰",
});

export function formatWorldTime(time: WorldTime) {
  return `第 ${time.day} 日 · ${time.phase} · ${time.clock}`;
}

export function normalizeWorldState(worldState?: Partial<WorldState> | null): WorldState {
  const base = structuredClone(starterWorldState);

  if (!worldState) {
    return base;
  }

  return {
    era: worldState.era ?? base.era,
    location: worldState.location ?? base.location,
    scene: worldState.scene ?? base.scene,
    time: {
      day: worldState.time?.day ?? base.time.day,
      phase: worldState.time?.phase ?? base.time.phase,
      clock: worldState.time?.clock ?? base.time.clock,
    },
    player: {
      ...base.player,
      ...worldState.player,
      inventory: worldState.player?.inventory ?? base.player.inventory,
      skills: worldState.player?.skills ?? base.player.skills,
    },
    activeNpc: {
      ...base.activeNpc,
      ...worldState.activeNpc,
      inventory: worldState.activeNpc?.inventory ?? base.activeNpc.inventory,
      skills: worldState.activeNpc?.skills ?? base.activeNpc.skills,
    },
    activeQuest: {
      ...base.activeQuest,
      ...worldState.activeQuest,
    },
  };
}
