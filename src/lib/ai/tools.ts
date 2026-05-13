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

export const gameTools = {
  startCombat: tool({
    description:
      "当剧情进入战斗时立即调用。传入对手的完整 NPC 信息，战斗系统将接管并在战斗结束后把结果返回给你，你再根据结果继续叙事。",
    inputSchema: z.object({
      enemy: npcSchema,
      triggerDescription: z
        .string()
        .describe("一句话描述战斗是如何触发的，用于战斗界面的开场提示。"),
    }),
    outputSchema: z.object({
      outcome: z.enum(["victory", "defeat", "fled"]),
      summary: z.string().describe("战斗结果的一句话总结，供叙事引擎继续剧情。"),
    }),
    // 无 execute → 客户端托管，由前端 addToolOutput 回传结果
  }),
};
