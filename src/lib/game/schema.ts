export type PlayerState = {
  name: string;
  realm: string;
  sect: string;
  spiritRoot: string;
  hp: number;
  qi: number;
  inventory: string[];
};

export type NpcState = {
  id: string;
  name: string;
  title: string;
  motive: string;
  disposition: "hostile" | "guarded" | "neutral" | "curious" | "allied";
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
    qi: 18,
    inventory: ["下品灵石×3", "回气丹×1", "青铜铃（来历不明）"],
  },
  activeNpc: {
    id: "zhishi-lin-wanyu",
    name: "林挽玉",
    title: "青云宗外门执事",
    motive: "甄选堪造之材，暗中追查你袖中那枚青铜铃的来历。",
    disposition: "guarded",
  },
  activeQuest: {
    id: "waimen-shilian-chuqi",
    title: "外门试炼·初阶",
    stage: "开场",
    objective: "在林挽玉执事主持的首轮比试中立足，争取下月宗门任务的名额。",
  },
};
