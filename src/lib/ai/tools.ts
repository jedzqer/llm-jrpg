import { tool } from "ai";
import { z } from "zod";

const skillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  qiCost: z.number(),
  power: z.number(),
  kind: z.enum(["attack", "defend", "heal"]),
});

const npcSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  motive: z.string(),
  disposition: z.enum(["hostile", "guarded", "neutral", "curious", "allied"]),
  realm: z.string(),
  hp: z.number(),
  maxHp: z.number(),
  qi: z.number(),
  maxQi: z.number(),
  inventory: z.array(z.string()),
  skills: z.array(skillSchema),
});

const worldTimeSchema = z.object({
  day: z.number().int().positive(),
  phase: z.string(),
  clock: z.string(),
});

export const worldStateChangeInputSchema = z
  .object({
    location: z.string().optional().describe("地点发生变化时填写新的地点名称。"),
    scene: z.string().optional().describe("场景氛围、环境描述发生变化时填写新的 scene。"),
    time: worldTimeSchema
      .partial()
      .optional()
      .describe("时间发生变化时填写新的绝对时间字段；只需提供发生变化的字段。"),
    quest: z
      .object({
        stage: z.string().optional(),
        objective: z.string().optional(),
      })
      .optional()
      .describe("任务阶段或目标变化时填写。"),
  })
  .refine(
    (value) =>
      value.location !== undefined ||
      value.scene !== undefined ||
      value.time !== undefined ||
      value.quest !== undefined,
    {
      message: "至少提供一个世界状态变化字段",
    },
  );

export type WorldStateChangeInput = z.infer<typeof worldStateChangeInputSchema>;

export const gameTools = {
  updateWorldState: tool({
    description:
      "当叙事导致时间、地点、场景或任务目标发生变化时调用。只提交变化项，系统会据此更新世界状态，并把更新后的快照返回给你。",
    inputSchema: worldStateChangeInputSchema,
    outputSchema: z.object({
      summary: z.string().describe("系统已应用的状态变化摘要。"),
      snapshot: z.object({
        location: z.string(),
        scene: z.string(),
        time: worldTimeSchema,
        questStage: z.string(),
        questObjective: z.string(),
      }),
    }),
  }),
  startCombat: tool({
    description:
      "当剧情进入战斗时立即调用。传入对手的完整 NPC 信息，战斗系统将接管并在战斗结束后把结果返回给你，你再根据结果继续叙事。",
    inputSchema: z.object({
      combatType: z
        .enum(["spar", "lethal"])
        .describe("战斗类型。比试切磋用 spar，生死厮杀用 lethal。"),
      enemy: npcSchema,
      triggerDescription: z
        .string()
        .describe("一句话描述战斗是如何触发的，用于战斗界面的开场提示。"),
    }),
    outputSchema: z.object({
      outcome: z.enum(["victory", "defeat", "fled"]),
      summary: z.string().describe("战斗结果的一句话总结，供叙事引擎继续剧情。"),
      player: z.object({
        hp: z.number(),
        maxHp: z.number(),
        qi: z.number(),
        maxQi: z.number(),
      }),
      enemy: z.object({
        id: z.string(),
        hp: z.number(),
        maxHp: z.number(),
        qi: z.number(),
        maxQi: z.number(),
      }),
    }),
    // 无 execute → 客户端托管，由前端 addToolOutput 回传结果
  }),
};
