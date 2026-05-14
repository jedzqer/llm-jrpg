# 项目问题清单

## 2. 状态管理混乱

`Home` 组件有 25+ 个 useState，没有使用 reducer 或 context。状态之间存在隐式依赖（`historyLoaded` + `worldLoaded` + `configLoaded` 共同决定 `chatReady`），容易出现竞态条件。

## 3. API Key 明文存储

`llm_configs` 表直接存储 `api_key TEXT`，没有加密。本地应用影响较小，但数据库文件泄露时密钥直接暴露。

## 4. 缺少测试

没有测试框架，核心逻辑（战斗系统、世界状态规范化、物品系统）完全没有测试覆盖。

## 5. 战斗状态未持久化

`startCombat` 是 client-side 工具，战斗逻辑在前端 `CombatPanel` 里运行。如果用户刷新页面或网络中断，进行中的战斗状态丢失（`CombatState` 没有写入数据库）。

## 6. normalizeWorldState fallback 有隐患

用 `starterWorldState` 作为 base，如果数据库里的 worldState 缺少字段，会回退到硬编码角色（"沈惊蛰"）的数据，而不是当前玩家数据。

## 7. SSE 流解析可能丢数据

`route.ts` 里的 DeepSeek reasoning_content 拦截假设每个 chunk 都是完整的 `data:` 行。实际 SSE chunk 可能跨行切割，`text.split("\n")` 会丢失不完整的行。

## 8. 没有 Error Boundary

前端没有 React Error Boundary。渲染异常时整个页面白屏，用户丢失当前进度。

## 9. 存档缺少版本迁移

`save_slots` 存的是 JSON 快照。WorldState schema 变更后，旧存档读取可能出现 undefined 字段或类型不匹配，没有版本号和迁移逻辑。

## 10. 环境变量与数据库配置冗余

`.env.example` 定义了 `OPENAI_*` 环境变量，同时又有 `llm_configs` 表和前端配置面板。两套配置源增加了优先级处理的复杂度。

---

## 优先级

| 优先级 | 问题 | 影响 |
|--------|------|------|
| 高 | 7. SSE 流解析 bug | DeepSeek 模式下丢失 reasoning |
| 高 | 5. 战斗状态未持久化 | 刷新丢失战斗 |
| 中 | 4. 添加测试 | 长期质量保障 |
| 中 | 6. normalizeWorldState fallback | 数据正确性 |
| 中 | 8. Error Boundary | 用户体验 |
| 低 | 9. 存档版本迁移 | 未来兼容性 |
| 低 | 3. API Key 加密 | 安全性 |
| 低 | 10. 配置冗余 | 代码复杂度 |
| 低 | 2. 状态管理 | 随拆分一起解决 |
