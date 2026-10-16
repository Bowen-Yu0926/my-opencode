---
id: OC-WS-002
title: 点击侧栏已打开会话时不新增不破坏其它 Tab
module: OpenCode/工作区会话Tab
priority: P0
type: ui-e2e
env:
  profile: local
  base_url: ${OC_BASE_URL}
  app_path: ${OC_APP_PATH}
  role: 本地开发者
source: packages/app/src/context/tabs.tsx openSessionTab existing 分支, packages/app/src/components/session-history-panel.tsx open
version: 1
status: active
depends_on: OC-WS-001
reverse_of: OC-WS-001
reverse_type: K
automation: packages/app/e2e/regression/session-list-replace-tab.spec.ts
last_run: PASS
last_run_at: 2026-10-16 13:25
---

## 目标

当会话 A、B 均已在标题栏打开且当前停在 A 时，再从侧栏点击已打开的会话 B，验证只切换到 B，**Tab 数量不变**、A 的 Tab 仍在（非法「再开一份 B」被现有 Tab 路径拦住）。

## 前置条件

- 同 OC-WS-001 环境门禁
- 标题栏已预先存在两个会话 Tab（A 与 B）；可用初始化 `opencode.window.browser.dat:tabs` 或先用非侧栏路径打开第二个 Tab
- 当前路由停在会话 A

## 导航

- **入口**：菜单优先，失败则直达
- **菜单**：会话页 → 左侧「项目」→ 展开项目 → 会话列表
- **直达**：`{base_url}{app_path}server/<base64(server)>/session/<TD_WS_SESSION_A>`（tabs 本地已含 A、B）
- **首屏**：标题栏可见两个会话 Tab；侧栏列表可见 B

## 定位

- 项目会话列表：`[data-component="project-session-list"]`
- 会话行：`[data-action="project-session-row"]`
- 标题栏会话 Tab：`[data-slot="titlebar-tabs"] a[data-titlebar-tab-link]`

## 测试数据

- **TD_WS_SESSION_A**（当前活跃会话）
  - 取值：进页后当前 heading / 活跃 Tab 文案
  - 来源：进页后采集
  - 用后：保留
- **TD_WS_SESSION_B**（已打开的另一会话 Tab）
  - 取值：标题栏第二个会话 Tab 文案（与 A 不同）
  - 来源：进页后采集
  - 用后：保留
- **TD_WS_TAB_COUNT**（点击前 Tab 数）
  - 取值：标题栏 `a[data-titlebar-tab-link]` 的数量（期望为 2）
  - 来源：进页后采集
  - 用后：本用例内比对，不清理

## 业务逻辑（来自代码）

### 前端

- `openSessionTab`（`tabs.tsx:219-225`）：`existing = store.find(tabKey)` 命中时 **仅** `navigateTab(existing)` 并 return，不走替换/`push`
- 对比正向 OC-WS-001：未命中 existing 时才替换活跃 Tab（`tabs.tsx:227-241`）
- 侧栏入口仍为 `session-history-panel.tsx:111` `tabs.openSessionTab`
- 异常/边界：重复打开已开会话 = 状态上的「再开」被 existing 分支拦截；无 toast 文案（静默导航）
- 仅前端：无后端错误提示原文；断言以「Tab 数不变 + A 仍在」代替提示原文

### 后端

- 后端未找到：无 API 拦截；失败主题为前端状态非法（重复打开）

## 影响面

- **多 Tab 工作区切换**（已证实）
  - 依据：existing 分支只导航
  - 本用例：覆盖
- **替换路径误伤已开会话**（已证实）
  - 依据：若误走替换会删掉 A；本用例证明未走替换
  - 本用例：覆盖

## 步骤

1. **打开** — 已含双 Tab 的会话 A 页
   - 输入：直达 A；本地 tabs 含 A 与 B
   - 期望：heading 为 TD_WS_SESSION_A；标题栏同时可见 A、B 两个会话 Tab

2. **断言** — 记录点击前 Tab 数
   - 输入：无
   - 期望：标题栏会话 Tab 数量等于 TD_WS_TAB_COUNT（为 2）

3. **点击** — 侧栏已打开的会话 B
   - 输入：点击文案含 TD_WS_SESSION_B 的 `[data-action="project-session-row"]`
   - 期望：主区 heading 变为 TD_WS_SESSION_B；URL 以 `/session/<B>` 结尾

4. **断言** — 未新增且未破坏其它 Tab
   - 输入：无
   - 期望：再开 B 被 existing 路径拦住（无新 Tab）；标题栏会话 Tab 数仍等于 TD_WS_TAB_COUNT；文案含 TD_WS_SESSION_A 与 TD_WS_SESSION_B 的 Tab 各仍存在 1 个

## 通过标准

- [ ] 点击已打开会话后导航到该会话
- [ ] 标题栏会话 Tab 数量与点击前相同（未新增）
- [ ] 原会话 A 的 Tab 仍然存在（数据/状态未脏删）

## 失败时

- 截图标题栏 Tabs + 侧栏
- 记录 tabs localStorage
- 环境失败标 `BLOCKED`

## 执行记录

- 结果：PASS
- 时间：2026-10-16 13:25
- 环境：http://127.0.0.1:3000/（无登录）
- 数据：会话 A、B 均已打开；点击前标签数为 2；用后保留
- 证据：`_probe/OC-WS-002_s1.png`、`_probe/OC-WS-002_s4.png`
- 说明：再次从侧栏打开已在标签栏中的会话 B，只切换到 B，标签数仍为 2，会话 A 的标签还在
