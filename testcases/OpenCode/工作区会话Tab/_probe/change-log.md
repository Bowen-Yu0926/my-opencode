# change-log · 工作区会话Tab

变更：working-tree 最近改动（openSessionTab + workspace selection 同步 + 侧栏按钮移除）  
日期：2026-10-16

| 受影响入口 | 覆盖方式 | 动作 | 用例 id | 原因 |
|-----------|---------|------|---------|------|
| `tabs.openSessionTab` 替换分支 | 新写用例 | new | OC-WS-001 | 侧栏打开未开会话须替换当前 Tab |
| `tabs.openSessionTab` existing 分支 | 新写用例 | new | OC-WS-002 | 逆向 E：已打开会话再点不得增 Tab/删其它 Tab |
| `WorkspaceFilePanel` selection 同步 + `titlebar.openNewTab` | 新写用例 | new | OC-WS-003 | 高亮与新建会话须跟随活跃会话项目 |
| `workspace-panel-new-session` / `workspace-panel-new-project` 按钮 | EXEMPT | stale→入口迁移 | — | 控件已删除；入口改为 titlebar / `project.open`；旧 Playwright 定位需随 OC-WS-003 更新 |
| `home-sessions-controller` background=`addSessionTab` | EXEMPT | unchanged | — | 非本次主路径，行为刻意保留新增 Tab |
| 主题/CSS/插件 toast 文案 | EXEMPT | unchanged | — | 无 Tab/项目选择行为断言点 |
