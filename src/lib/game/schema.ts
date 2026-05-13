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

export type WorldState = {
  era: string;
  location: string;
  scene: string;
  player: PlayerState;
  activeNpc: NpcState;
  activeQuest: QuestState;
};

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
  player: CombatParticipant;
  enemy: CombatParticipant;
  log: CombatLogEntry[];
  outcome: CombatOutcome;
};

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

export const starterWorldState: WorldState = {
  era: "灵气复苏第三百年，九州列国林立，正邪仙门对峙。",
  location: "青云宗·外门",
  scene: "演武场试炼初日，夜雨初霁，青石泛着湿光。",
  player: {
    name: "沈惊蛰",
    realm: "炼气三层",
    sect: "青云宗外门弟子",
    spiritRoot: "三灵根（水、木、雷）",
    hp: 20,
    maxHp: 20,
    qi: 18,
    maxQi: 18,
    inventory: ["下品灵石×3", "回气丹×1", "青铜铃（来历不明）"],
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
