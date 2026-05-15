# 项目问题清单

## 3. API Key 明文存储

`llm_configs` 表直接存储 `api_key TEXT`，没有加密。本地应用影响较小，但数据库文件泄露时密钥直接暴露。

## 4. 缺少测试

没有测试框架，核心逻辑（战斗系统、世界状态规范化、物品系统）完全没有测试覆盖。

## 5. 战斗状态未持久化

`startCombat` 是 client-side 工具，战斗逻辑在前端 `CombatPanel` 里运行。如果用户刷新页面或网络中断，进行中的战斗状态丢失（`CombatState` 没有写入数据库）。

## 7. SSE 流解析可能丢数据

`route.ts` 里的 DeepSeek reasoning_content 拦截假设每个 chunk 都是完整的 `data:` 行。实际 SSE chunk 可能跨行切割，`text.split("\n")` 会丢失不完整的行。

## 8. 没有 Error Boundary

前端没有 React Error Boundary。渲染异常时整个页面白屏，用户丢失当前进度。

## 9. 存档缺少版本迁移

`save_slots` 存的是 JSON 快照。WorldState schema 变更后，旧存档读取可能出现 undefined 字段或类型不匹配，没有版本号和迁移逻辑。
