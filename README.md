# LLM JRPG

`LLM JRPG` 是一个用于开发基于大语言模型的角色扮演游戏的起始项目。
当前技术栈刻意保持收敛，先保证原型能快速跑起来：

- 前端：`Next.js` + `React` + `AI SDK UI`
- 后端：`Node.js` 路由处理 + `AI SDK Core`
- 游戏领域层：本地 TypeScript 模块，负责玩家状态、NPC 状态、任务状态和世界上下文

这个仓库的目标不是一开始就堆复杂框架，而是先把“可玩的叙事循环”搭出来，再逐步扩展成完整 JRPG 系统。

AI创作剧情流动，编排NPC实体，在每次对话后如果引入了新的NPC，让AI通过tool call创建NPC实体，包括NPC状态、NPC物品、NPC技能。并遭遇战斗后，由AI通过tool call 来调用战斗系统，然后游戏战斗系统托管，提取AI生成NPC的技能道具参与战斗，如果NPC信息不完整，则调用AI补全信息。
工具调用可以采用分步法，在AI创作剧情时不要提供工具信息，让AI专注于创作，剧情结束后在后台调用AI来解析是否需要创建/更新NPC信息，允许AI在不需要时跳过。AI后台调用工具时先锁定用户输入键。
如果NPC长时间不出现，又重新遇到了，需要重新生成NPC实体的信息，以免人物信息停滞

## 当前状态

项目基础框架已经完成，`/api/chat` 已接入真实的流式 LLM 调用，并兼容 OpenAI-compatible API。
现在对话会话、消息历史、世界状态、手动存档和 LLM 配置都持久化到 `SQLite`，模型参数直接在应用界面里配置，不再依赖外部配置文件。

玩家可以随时手动存档；一旦战斗失败死亡，输入会被锁定，只能通过读档回到最近一次存档。此前的“删除消息”功能已移除，避免消息历史与世界状态回滚不一致。

## 目录结构

```text
.
├─ public/
├─ src/
│  ├─ app/
│  │  ├─ api/chat/route.ts
│  │  ├─ api/config/route.ts
│  │  ├─ globals.css
│  │  ├─ layout.tsx
│  │  └─ page.tsx
│  └─ lib/
│     ├─ ai/prompts.ts
│     └─ game/schema.ts
├─ data/                    # SQLite 数据文件目录（运行后生成）
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

2. 启动开发服务器：

```bash
npm run dev
```

3. 打开 `http://localhost:3000`

4. 在页面顶部的“模型配置”面板中填写：

- `Provider 名称`：默认 `openai`
- `模型 ID`：例如 `gpt-4o-mini`
- `Base URL`：兼容服务时填写，官方 OpenAI 可留空
- `API Key`：首次保存必填

5. 保存后即可开始对话，配置会写入 `data/app.db`

## 建议的下一步开发顺序

1. 把 `WorldState` / NPC / 任务状态继续并入现有 SQLite 持久化层
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

## 开发计划

- 游戏初始化需要自定义给玩家角色加点，命名等