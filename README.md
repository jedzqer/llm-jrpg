# LLM JRPG

`LLM JRPG` 是一个用于开发基于大语言模型的角色扮演游戏的起始项目。
当前技术栈刻意保持收敛，先保证原型能快速跑起来：

- 前端：`Next.js` + `React` + `AI SDK UI`
- 后端：`Node.js` 路由处理 + `AI SDK Core`
- 游戏领域层：本地 TypeScript 模块，负责玩家状态、NPC 状态、任务状态和世界上下文

这个仓库的目标不是一开始就堆复杂框架，而是先把“可玩的叙事循环”搭出来，再逐步扩展成完整 JRPG 系统。

AI创作剧情流动，编排NPC实体，在每次对话后如果引入了新的NPC，让AI通过tool call创建NPC实体，包括NPC状态、NPC物品、NPC技能。并遭遇战斗后，由AI通过tool call 来调用战斗系统，然后游戏战斗系统托管，提取AI生成NPC的技能道具参与战斗，如果NPC信息不完整，则调用AI补全信息。
工具调用可以采用分步法，在AI创作剧情时不要提供工具信息，让AI专注于创作，剧情结束后在后台调用AI来解析是否需要创建/更新NPC信息，允许AI在不需要时跳过。AI后台调用工具时先锁定用户输入键。
如果NPC长时间不出现，又重新遇到了，需要重新生成NPC实体的信息。

## 当前状态

项目基础框架已经完成，`/api/chat` 已接入真实的流式 LLM 调用，并兼容 OpenAI-compatible API。
首页已经替换为项目介绍页，后续主要工作会落在游戏状态推进、工具调用编排和前端聊天体验。

## 目录结构

```text
.
├─ public/
├─ src/
│  ├─ app/
│  │  ├─ api/chat/route.ts
│  │  ├─ globals.css
│  │  ├─ layout.tsx
│  │  └─ page.tsx
│  └─ lib/
│     ├─ ai/prompts.ts
│     └─ game/schema.ts
├─ .env.example
├─ .gitignore
├─ eslint.config.mjs
├─ next.config.ts
├─ package.json
└─ tsconfig.json
```

## 快速开始

1. 安装依赖：

```bash
npm install
```

2. 创建本地环境变量文件：

```bash
cp .env.example .env.local
```

Windows PowerShell 下可以使用：

```powershell
Copy-Item .env.example .env.local
```

3. 在 `.env.local` 中填入模型服务配置

官方 OpenAI：

```env
OPENAI_COMPATIBLE_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
```

OpenAI-compatible API（例如代理网关或兼容服务）：

```env
OPENAI_COMPATIBLE_API_KEY=your_provider_api_key
OPENAI_MODEL=your-model-id
OPENAI_BASE_URL=https://your-provider.example.com/v1
OPENAI_PROVIDER_NAME=your-provider
```

- `OPENAI_BASE_URL` 留空时默认走官方 `https://api.openai.com/v1`
- `OPENAI_PROVIDER_NAME` 主要用于给 AI SDK 内部 provider 标识命名，默认值是 `openai`

4. 启动开发服务器：

```bash
npm run dev
```

5. 打开 `http://localhost:3000`

## 建议的下一步开发顺序

1. 为 `WorldState` 接入持久化，原型期建议 `SQLite + Prisma`
2. 拆分叙事职责：
   - system prompt
   - NPC 记忆
   - 任务逻辑
   - 世界事件工具
3. 增加 RPG 专用工具能力：
   - 掷骰
   - 背包修改
   - 任务推进
   - 场景切换

## 推荐架构

### 前端

- `src/app/`：页面、路由和布局
- `src/components/chat/`：消息列表、输入框、头像、选项组件
- `src/components/game/`：属性面板、背包、任务日志、小地图
- `src/lib/client/`：自定义 transport 和前端辅助逻辑

### 后端

- `src/app/api/chat/route.ts`：主对话入口
- `src/lib/ai/`：prompt、模型配置、工具定义
- `src/lib/game/`：状态结构和规则辅助函数
- `src/lib/storage/`：持久化适配层

## 当前脚手架说明

- `.gitignore` 已覆盖 Next.js、TypeScript、日志和环境变量文件
- `src/lib/game/schema.ts` 内置了一个前哨站场景的基础世界状态
- `src/lib/ai/prompts.ts` 提供了一个绑定当前世界状态的基础系统提示词
- 首页已经替换为项目落地页，不再使用默认的 Next.js 欢迎页
