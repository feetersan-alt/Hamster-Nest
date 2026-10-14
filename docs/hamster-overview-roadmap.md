# 仓鼠窝六模块升级：实施路线（2026-10-14）

> 状态：设计与代码盘点阶段；本文件不是上线证明。分支 feature/hamster-overview-phase1，未改生产数据。

## 现有代码盘点

- React 19 + Vite + TypeScript；路由在 `src/App.tsx`。
- 首页在 `src/pages/HomePage.tsx`，使用可配置三页图标布局；手机端优先。
- 现有页面：`TodoPage`、`MemoPage`、`TimelinePage`、`EventCollectionPage` / `EventThreadPage`、`SyzygyFeedPage`、`DiaryPage`、`MemoryVaultPage`。
- Supabase 客户端位于 `src/supabase/client.ts`；现有 `src/storage/supabaseSync.ts` 及数据库类型可复用。
- 现有 `src/utils/memoRetrieval.ts` 和 `timelineManualRetrieval.ts` 可作为跨窗口记忆检索入口的参考，但不能直接等同于自动记忆闭环。
- 最近通过 MCP 读取的 Feed 为空；简报生成不可依赖其已有数据。

## 分阶段交付

1. **只读总览 MVP**：新增 `OverviewPage`，在 `App.tsx` 注册 `/overview`，首页图标可进入。直接复用现有 Supabase 查询；展示待办计数、进行中事件线、最近时间轴与 Memo 摘要。每一块都应有加载、空状态、错误和跳转。禁止把演示数据伪装成真实数据。
2. **考研追踪**：先使用待办分类与独立事件线记录科目、复习轮次、薄弱点；如确有必要再设计新表。学习进度只从用户确认或真实记录推导。
3. **跨窗口记忆接力**：按问题类型检索 Memo/事件线/时间轴；引用原记录并区分“已确认事实”和“待核实”。只有有长期价值的变化才写回。
4. **共同时间轴**：从现有时间轴/日记进行关联展示；不自动复制私密聊天或制造纪念事件。
5. **每日简报**：从当天待办、近期事件线、Feed 生成可追溯的简报；先手动生成，验证后再考虑调度与推送。避免重复创建任务。
6. **记忆整理员**：只提供重复、过期、已完成事项的整理建议；删除与覆盖必须单独确认，保留审计。

## 安全边界

- 仅操作 Hamster-Nest 对应项目，不触碰 JirayPet 项目。
- 不把 service-role 密钥放进浏览器；保持 RLS 与用户隔离。
- 开发在分支与 PR 中进行，不直接推送 `main`，不自行触发后台任务。
- 任何数据库结构变更先核对实际 schema 与迁移，再做独立审查。
- 每个功能需要代码检查、构建/测试、实际登录端读取和跨端回读；仅配置成功不算上线。

## 下一步（尚未完成）

检查 `TodoPage`、`EventCollectionPage`、`TimelinePage`、`MemoPage` 的查询与状态处理，实现第一个只读 `/overview` 页面，并在 PR 中报告构建结果与未验证项。
