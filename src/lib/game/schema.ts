export type ItemUsageContext = "panel" | "combat" | "passive";

export type ItemEffect = {
  stat: "hp" | "qi" | "maxHp" | "maxQi";
  delta: number;
};

export type ItemDef = {
  id: string;
  name: string;
  description: string;
  usage: ItemUsageContext;
  effects: ItemEffect[];
  consumable: boolean;
};

export type InventoryEntry = {
  itemId: string;
  quantity: number;
};

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
  backstory: string;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  inventory: InventoryEntry[];
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
  itemRegistry: ItemDef[];
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
  backstory: string;
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

export const starterItems: ItemDef[] = [
  {
    id: "xiapin-lingshi",
    name: "下品灵石",
    description: "蕴含微薄灵气的矿石，可用于恢复灵力。",
    usage: "panel",
    effects: [{ stat: "qi", delta: 5 }],
    consumable: true,
  },
  {
    id: "huiqi-san",
    name: "回气散",
    description: "散修常备丹药，服后可缓缓恢复灵力。",
    usage: "panel",
    effects: [{ stat: "qi", delta: 8 }],
    consumable: true,
  },
  {
    id: "waimen-mupai",
    name: "外门木牌",
    description: "青云宗外门弟子身份凭证。",
    usage: "passive",
    effects: [],
    consumable: false,
  },
];

const starterInventory: InventoryEntry[] = [
  { itemId: "xiapin-lingshi", quantity: 2 },
  { itemId: "huiqi-san", quantity: 1 },
  { itemId: "waimen-mupai", quantity: 1 },
];

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
    backstory: "",
    hp: CHARACTER_CREATION_MIN_HP,
    maxHp: CHARACTER_CREATION_MIN_HP,
    qi: CHARACTER_CREATION_MIN_QI,
    maxQi: CHARACTER_CREATION_MIN_QI,
    inventory: starterInventory,
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
    inventory: [],
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
  itemRegistry: [],
};

export const defaultCharacterCreationProfile: CharacterCreationProfile = {
  name: "",
  sect: "青云宗外门弟子",
  spiritRoot: "双灵根",
  backstory: "",
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
      backstory: profile.backstory.trim(),
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
  backstory: "自幼在山野间长大的孤儿，偶然拾得一枚青铜铃，铃声引来青云宗外门执事。",
});

export function formatWorldTime(time: WorldTime) {
  return `第 ${time.day} 日 · ${time.phase} · ${time.clock}`;
}

export function normalizeWorldState(worldState?: Partial<WorldState> | null): WorldState {
  const base = structuredClone(starterWorldState);

  if (!worldState) {
    return base;
  }

  const rawInventory = worldState.player?.inventory;
  let playerInventory: InventoryEntry[];
  if (!rawInventory) {
    playerInventory = base.player.inventory;
  } else if (rawInventory.length > 0 && typeof (rawInventory as unknown[])[0] === "string") {
    playerInventory = (rawInventory as unknown as string[]).map((s) => ({
      itemId: s.replace(/×\d+$/, "").trim(),
      quantity: Number(s.match(/×(\d+)$/)?.[1] ?? 1),
    }));
  } else {
    playerInventory = rawInventory as InventoryEntry[];
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
      backstory: worldState.player?.backstory ?? base.player.backstory,
      inventory: playerInventory,
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
    itemRegistry: worldState.itemRegistry ?? base.itemRegistry,
  };
}
