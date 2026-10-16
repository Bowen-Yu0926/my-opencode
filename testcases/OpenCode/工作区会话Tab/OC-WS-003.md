---
id: OC-WS-003
title: 核对工作区高亮跟随活跃会话且新建会话落到该项目
module: OpenCode/工作区会话Tab
priority: P0
type: ui-e2e
env:
  profile: local
  base_url: ${OC_BASE_URL}
  app_path: ${OC_APP_PATH}
  role: 本地开发者
source: packages/app/src/components/workspace-file-panel.tsx createEffect 同步 selection, packages/app/src/components/titlebar.tsx openNewTab, packages/app/src/i18n
version: 1
status: active
automation: packages/app/e2e/regression/panel-new-session-project.spec.ts
last_run: PASS
last_run_at: 2026-10-16 13:25
---

## 目标

Home selection 预先指向项目 B，但打开的是项目 A 下的会话时：侧栏高亮必须落到 A；点击 titlebar「新建会话」后，新建 draft 的 directory 必须是 A（不是 B）。

## 前置条件

- `${OC_BASE_URL}` 可达；新布局开启
- 全局已登记两个本地项目：TD_WS_PROJECT_A（会话所在）与 TD_WS_PROJECT_B（仅 selection 误指）
- 存在属于项目 A 的会话 TD_WS_SESSION_OPEN
- layout.home.selection 初始 directory=TD_WS_PROJECT_B（用于制造「选中与活跃会话不一致」）

## 导航

- **入口**：菜单优先，失败则直达
- **菜单**：打开项目 A 的会话 → 观察左侧「项目」高亮 → 点 titlebar 新建会话
- **直达**：`{base_url}{app_path}server/<base64(server)>/session/<TD_WS_SESSION_OPEN>`
- **首屏**：左侧项目列表可见 A、B；titlebar 可见「新建会话」按钮（`command.session.new` → zh「新建会话」）

## 定位

- 项目行：`[data-action="workspace-file-panel-project"][data-worktree="<path>"]`（aria-current=page 表示高亮）
- 新建会话：`[data-action="titlebar-new-session"]`（aria-label 来自 `command.session.new`）
- draft directory：`localStorage["opencode.window.browser.dat:tabs"]` 中 type=draft 的末项 `directory`

## 测试数据

- **TD_WS_PROJECT_A**（活跃会话所属项目 worktree）
  - 取值：进页后会话所在项目路径（与会话 directory / 项目 worktree 一致）
  - 来源：进页后从高亮项目行 `data-worktree` 或会话上下文采集
  - 用后：保留
- **TD_WS_PROJECT_B**（初始错误 selection 项目）
  - 取值：侧栏另一项目行 `data-worktree`（与 A 不同）
  - 来源：进页后采集；前置写入 selection
  - 用后：保留
- **TD_WS_SESSION_OPEN**（打开中的会话标题）
  - 取值：主区 heading
  - 来源：进页后采集
  - 用后：保留

## 业务逻辑（来自代码）

### 前端

- 同步高亮：`workspace-file-panel.tsx:63-105` — 路由为 session 时，用 `projectForSession` 得到 worktree，调用 `layout.home.setSelection({ server, directory: project.worktree })`，并 `setExpanded`
- 项目行高亮：`isActive` / `aria-current` 绑定 `activeDirectory()`（同文件 `activeDirectory` / `isActive`）
- 新建会话：`titlebar.tsx:265-286` `openNewTab` **优先**使用 `layout.home.selection()` 的 directory（在 selection 对应项目存在时）创建 draft；因此 selection 必须先被上一步同步到活跃会话项目，否则会落到错误项目
- 按钮文案：`command.session.new` → en「New session」/ zh「新建会话」（`en.ts:52`，`zh.ts:156`）
- 侧栏已无 `workspace-panel-new-session` / `workspace-panel-new-project`（改动后入口迁移到 titlebar / `project.open`）

### 后端

- 后端未找到：新建 draft 为前端 Tab 状态；不调用 session.create 直至用户发送消息（本用例只断言 draft.directory）

## 影响面

- **titlebar 新建会话目录**（已证实）
  - 依据：`openNewTab` 读 selection
  - 本用例：覆盖
- **打开项目命令 Ctrl+O**（推测）
  - 依据：`workspace-file-panel.tsx:115-125` `project.open` → `homeProjects.project.choose`
  - 本用例：不覆盖 → 可另开 OC-WS-00x
- **桌面 File 菜单 New Session**（推测）
  - 依据：desktop-menu 绑定同 command id
  - 本用例：不覆盖

## 步骤

1. **打开** — 项目 A 的会话页（selection 初始为 B）
   - 输入：直达 TD_WS_SESSION_OPEN；layout selection.directory=TD_WS_PROJECT_B
   - 期望：主区 heading 为 TD_WS_SESSION_OPEN；左侧项目列表同时出现 A、B

2. **断言** — 工作区高亮跟随活跃会话
   - 输入：无
   - 期望：项目行 `data-worktree=TD_WS_PROJECT_A` 的 `aria-current` 为 `page`；项目行 B **没有** `aria-current=page`

3. **点击** — titlebar 新建会话
   - 输入：点击 `[data-action="titlebar-new-session"]`
   - 期望：URL 匹配 `/new-session?draftId=`；出现新建会话页

4. **断言** — draft 目录为活跃会话项目
   - 输入：读取 tabs 中最新 draft.directory
   - 期望：draft.directory 等于 TD_WS_PROJECT_A；不等于 TD_WS_PROJECT_B；侧栏项目 A 仍保持 `aria-current=page`

## 通过标准

- [ ] 打开会话后侧栏高亮为该会话所属项目，而非初始错误 selection
- [ ] titlebar 新建会话进入 `/new-session?draftId=`
- [ ] 新建 draft 的 directory 与活跃会话项目一致

## 失败时

- 截图侧栏高亮 + 新建会话页
- 记录 selection（layout）与 tabs 中 draft.directory
- 环境失败标 `BLOCKED`

## 执行记录

- 结果：PASS
- 时间：2026-10-16 13:25
- 环境：http://127.0.0.1:3000/（无登录）
- 数据：活跃项目 = C:/OpenCode/OpenProject；初始选中项目 = C:/OpenCode/SelectedProject；会话 = Existing session
- 证据：`_probe/OC-WS-003_s2.png`、`_probe/OC-WS-003_s4.png`
- 说明：打开会话后侧栏高亮落在该会话所属项目；标题栏新建会话的目录也是这个项目，不是最初选中的另一个项目
