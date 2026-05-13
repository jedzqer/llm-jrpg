# DEVELOPMENT.md

开发过程中沉淀的经验与踩坑记录。写给未来的自己（和 Claude）看，目标是减少重复试错。新知识随时追加，过时了就改。

## 文档查询

首选 `ctx7` CLI，别凭训练数据写 API —— 大版本更替时记忆几乎全错。两步流程：

```bash
npx ctx7@latest library "<library name>" "<question>"   # 解析 ID，取 /org/repo
npx ctx7@latest docs <id> "<question>"                  # 拉文档
```

**Windows Git Bash 坑（踩过一次）**：MSYS 会把 `/vercel/ai` 这种参数自动补全成 `C:/Program Files/Git/vercel/ai`，`ctx7 docs` 会报 `Invalid library ID`。加 `MSYS_NO_PATHCONV=1` 前缀即可：

```bash
MSYS_NO_PATHCONV=1 npx ctx7@latest docs /vercel/ai "..."
```

`library` 步骤参数不以 `/` 开头，不受影响；只有 `docs` 步骤需要这个前缀。

Library ID 用 `/websites/ai-sdk_dev` 通常比 `/vercel/ai` 召回更多示例（前者索引了 ai-sdk.dev 整站）。

## AI SDK v5 关键事实

AI SDK v5 的形状和旧版本不一样，下面是本项目**实际通过 `next build` 验证**的最小模式。

### 服务端 Route Handler（App Router）

```ts
import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: "...",
    messages: await convertToModelMessages(messages),
  });
  return result.toUIMessageStreamResponse();
}
```

- 默认可直接用 `openai()`；若要接 OpenAI-compatible 服务，则改用 `createOpenAI({ baseURL, name })`
- 本项目显式读取 `OPENAI_COMPATIBLE_API_KEY` 传给 provider，不依赖 SDK 默认的 `OPENAI_API_KEY`
- `convertToModelMessages` 在部分文档示例中带 `await`、部分不带 —— 统一 `await` 对同步返回也安全
- 响应用 `result.toUIMessageStreamResponse()`，前端 `useChat` 才能解析流
- 请求体的 `messages` 类型是 `UIMessage[]`（前端 `useChat` 的消息形态），服务端转成 `ModelMessage[]` 后才能喂给 `streamText`

### 客户端 useChat

```tsx
"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

const { messages, sendMessage, status, error } = useChat({
  transport: new DefaultChatTransport({ api: "/api/chat" }),
});

sendMessage({ text: "..." });          // 纯文本
sendMessage({ role: "user", parts: [...] });  // 多模态
```

- `useChat` 从 `@ai-sdk/react`，`DefaultChatTransport` 从 `ai` —— 别搞混
- v5 的 `useChat` 不再返回 `input/handleInputChange/handleSubmit`，自己用 `useState` + `sendMessage`
- 渲染走 `message.parts`，按 `part.type` 分支（`text` / `file` / `tool-<name>`），**不要**取 `message.content`
- `status` 四态：`ready` / `submitted` / `streaming` / `error`；发送中 = `submitted || streaming`

## 本项目架构备忘

补 CLAUDE.md 没明说的部分。

### WorldState 当前"每请求重入"

`src/lib/ai/prompts.ts` 在**模块加载时**把 `starterWorldState` 序列化进 `baseSystemPrompt` 字符串，此后每次请求都注入同一份。含义：

- 玩家动作**不会**真正改变 NPC 态度、物品、境界；即便叙事这么写，下一轮 prompt 又被重置
- 要做真 state 推进，需把 WorldState 拎到运行期（client store / server session / DB），每次请求动态拼 system prompt，并让模型通过 tool-call 产出状态变更

### 模型与服务切换

- 改 `.env.local` 的 `OPENAI_MODEL` 即可，不用动代码。`gpt-4o-mini` 之外的任何 `@ai-sdk/openai` 支持的模型名都行。
- 如果不是官方 OpenAI，而是 OpenAI-compatible 服务，额外设置 `OPENAI_BASE_URL`。
- `OPENAI_PROVIDER_NAME` 只影响 AI SDK 内部 provider 名称标识，默认保留 `openai` 即可。

## 验证清单

改完代码按顺序过一遍：

```bash
npx tsc --noEmit      # 类型检查（package.json 没 typecheck 脚本，直接调 tsc）
npm run lint          # ESLint
npm run build         # Next.js 完整构建，会再跑一次 tsc + 生成路由表
```

`npm run build` 的路由表里，`/api/chat` 应是 `ƒ (Dynamic)`，`/` 是 `○ (Static)`（client 组件的外壳也能 prerender）。

没 OpenAI key 时无法真跑对话流，但以上三步能拦住绝大多数静态问题。

## 何时更新本文件

- 踩到非显而易见的坑，且下次还会遇到 → 记下复现和解法
- 通过 `ctx7` 拿到的关键文档片段，且和本项目的写法直接相关 → 贴最小可用片段
- 训练数据与实际 API 冲突，实测后的正确写法 → 覆盖记忆
- 不记：显而易见的事实、在 CLAUDE.md 已写的、仅本次任务相关的临时上下文
