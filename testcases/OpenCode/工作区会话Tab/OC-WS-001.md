---
id: OC-WS-001
title: 点击侧栏未开会话时替换当前 Tab
module: OpenCode/工作区会话Tab
priority: P0
type: ui-e2e
env:
  profile: local
  base_url: ${OC_BASE_URL}
  app_path: ${OC_APP_PATH}
  role: 本地开发者
source: packages/app/src/context/tabs.tsx openSessionTab, packages/app/src/components/session-history-panel.tsx open, packages/app/src/components/workspace-file-panel.tsx ProjectSessionList
version: 1
status: active
automation: packages/app/e2e/regression/session-list-replace-tab.spec.ts
last_run: PASS
last_run_at: 2026-10-16 13:25
---

## 目标

在已打开会话 A 的窗口中，从左侧工作区项目下的会话列表点击尚未打开的会话 B，验证标题栏只保留 B 一个会话 Tab（A 被替换，不新增第二个 Tab）。

## 前置条件

- `${OC_BASE_URL}` 可达；本地 app 已起（或执行器按 Playwright webServer 拉起）
- 已开启新布局：`settings.v3.general.newLayoutDesigns = true`
- 同一项目下至少有两个会话（本用例用 TD 自建 mock / 进页后从侧栏采集）
- 无需门户登录；无系统版本弹窗则跳过关闭

## 导航

- **入口**：菜单优先，失败则直达
- **菜单**：打开已有会话 Tab → 左侧「项目」→ 展开项目 → 会话列表
- **直达**：`{base_url}{app_path}server/<base64(server)>/session/<TD_WS_SESSION_A>`
- **首屏**：确认左侧 `Projects and sessions` /「项目」侧栏可见；项目行已展开并出现会话列表

## 定位

- 项目会话列表：`[data-component="project-session-list"]`（原因：稳定 test-contract）
- 会话行：`[data-action="project-session-row"]`（可见标题过滤）
- 标题栏会话 Tab：`[data-slot="titlebar-tabs"] a[data-titlebar-tab-link]`
- 会话标题：`heading` 角色，名称=会话 title

## 测试数据

- **TD_WS_SESSION_A**（当前已打开会话）
  - 取值：进页后标题栏当前 Tab 文案 / 会话 heading
  - 来源：打开直达 URL 后采集
  - 用后：保留（被替换后 Tab 消失属预期）
- **TD_WS_SESSION_B**（侧栏中另一会话，当前未开 Tab）
  - 取值：侧栏 `[data-component="project-session-list"]` 中与 A 标题不同的第一行文案
  - 来源：进页后采集
  - 用后：保留（成为当前 Tab）

## 业务逻辑（来自代码）

### 前端

- 页面/路由：会话页 `/server/.../session/:id`；侧栏由 `WorkspaceFilePanel` 渲染 `ProjectSessionList`（`workspace-file-panel.tsx:318-323`）
- 点击会话行：`SessionRow` → `props.source.open(session)`（`session-history-panel.tsx:260`）→ `open()` 调用 `tabs.openSessionTab`（`session-history-panel.tsx:98-111`）
- Tab 规则（`tabs.tsx:219-248` `openSessionTab`）：
  - 若目标 session 已有 Tab → `navigateTab`，不新增
  - 若无 Tab：取 `activeTabIndex()`，有活跃下标则 **原地替换** `tabs[index] = next`，并清理 previous 的 memory/info；无活跃下标才 `push`
- 仅前端状态：Tab 存 `opencode.window.browser.dat:tabs`；不调用新建 session API
- 文案：侧栏 aria-label i18n `sidebar.nav.projectsAndSessions` → en「Projects and sessions」/ zh 侧栏「项目」（`en.ts:857`，`zh.ts:731` `home.projects`）

### 后端

- 后端未找到：本行为纯前端 Tab 状态机，不依赖 session create/delete API
- 会话列表数据来自既有 `session.list` / home session index（本用例只消费已有列表，不测列表接口错误）

## 影响面

- **标题栏 Tab 数量**（已证实）
  - 依据：`openSessionTab` 替换分支会去掉 previous tab key
  - 本用例：覆盖
- **Home 会话行点击**（推测）
  - 依据：`home-sessions-controller.tsx` 同样调用 `openSessionTab`
  - 本用例：不覆盖 → 另开或依赖同规则；冒烟仍以侧栏为准
- **背景打开（addSessionTab）**（已证实差异）
  - 依据：`home-sessions-controller.tsx` `options.background` 仍走 `addSessionTab`
  - 本用例：不覆盖 → EXEMPT（非本改动主路径）

## 步骤

1. **打开** — 会话 A 页
   - 输入：直达 URL（session=TD_WS_SESSION_A 对应 id）；确认新布局已开
   - 期望：出现会话标题为 TD_WS_SESSION_A 的 heading；标题栏可见会话 Tab

2. **断言** — 初始 Tab 数
   - 输入：无
   - 期望：标题栏 `a[data-titlebar-tab-link]` 恰好 1 个，文案含 TD_WS_SESSION_A

3. **点击** — 侧栏会话 B
   - 输入：在 `[data-component="project-session-list"]` 内点击文案含 TD_WS_SESSION_B 的 `[data-action="project-session-row"]`
   - 期望：主区 heading 变为 TD_WS_SESSION_B；URL 路径以 `/session/<B的id>` 结尾

4. **断言** — Tab 被替换而非新增
   - 输入：无
   - 期望：标题栏会话 Tab 仍恰好 1 个，文案含 TD_WS_SESSION_B；不存在文案含 TD_WS_SESSION_A 的 Tab

## 通过标准

- [ ] 从侧栏打开未开会话后，主区显示该会话标题
- [ ] 标题栏会话 Tab 数量仍为 1
- [ ] 原会话 A 的 Tab 不再出现

## 失败时

- 截图当前页（侧栏会话列表 + 标题栏 Tabs）
- 记录 `localStorage["opencode.window.browser.dat:tabs"]` 中 sessionId 列表
- 环境不可达写 `BLOCKED`，勿编造通过

## 执行记录

- 结果：PASS
- 时间：2026-10-16 13:25
- 环境：http://127.0.0.1:3000/（4444 不可达，Playwright 拉起 3000；无登录）
- 数据：会话 A = Replace tab session A；会话 B = Replace tab session B；用后保留
- 证据：`_probe/OC-WS-001_s1.png`、`_probe/OC-WS-001_s4.png`
- 说明：从侧栏打开尚未打开的会话 B 后，标题栏只剩 B，会话 A 的标签被替换
