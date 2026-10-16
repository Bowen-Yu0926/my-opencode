# 本地 OpenCode 插件

本目录是 `%USERPROFILE%\.config\opencode\plugins\` 的仓库快照，便于备份与协作。

实际加载仍以全局配置 `~/.config/opencode/opencode.jsonc` 的 `plugin` / `disabled_plugins` 为准。

## 当前启用（全局）

| 来源 | 说明 |
|------|------|
| `@cortexkit/opencode-magic-context@latest` | Magic Context：上下文压缩与项目记忆 |
| `opencode-plugin-notification` | 任务完成/报错通知 |
| `opencode-exit-plan` | 批准实现后退出 Plan 模式 |
| `@json9512/opm` | `/opm` 运行时开关插件 |
| `opencode-plugin-inspector` | 插件检查/调试 |
| `opencode-plugin-compose` | 插件组合 |
| `git-context.ts` | 注入 Git 分支/脏文件/近期提交 |
| `diff-engine.ts` | Diff 相关工具 |
| `error-journal.ts` | 错误日志 |
| `decision-log.ts` | 决策记录 |
| `task-manager.ts` | 任务管理 |
| `notepad.ts` | 记事本 |
| `snippet-library.ts` | 代码片段库 |
| `command-history.ts` | 命令历史 |
| `project-profile.ts` | 项目画像 |

## 当前停用（`disabled_plugins`）

| 项 | 原因 |
|----|------|
| `session-memory.ts` | 与 Magic Context 记忆重叠 |
| `codebase-index.ts` | 与仓库检索/Magic Context 冗余 |
| `opencode-keep-going` / `opencode-quick-links` | 偏 TUI，Desktop 收益低 |
| `opencode-postgres` / `opencode-mysql` | 未做 Agent 直连库则不必开 |
| `@te-river/opencode-team-mode` | 未用多角色协作 |
| `time-calc` / `math-calc` / `hash-encode` / `regex-tester` / `json-toolkit` / `image-downscale` | 工具过窄，占上下文 |

## 本目录额外附带（未进全局 plugin 列表）

| 路径 | 说明 |
|------|------|
| `ad-vision/` | 视觉相关插件 + `commands/*.md` |
| `ad-stats/` | Token 统计相关 + `commands/ad-tokens.md` |

## 同步方式

从本机全局插件目录覆盖到仓库：

```powershell
robocopy "$env:USERPROFILE\.config\opencode\plugins" "docs\local-plugins" /E
```

恢复到本机（谨慎覆盖）：

```powershell
robocopy "docs\local-plugins" "$env:USERPROFILE\.config\opencode\plugins" /E
```

## Magic Context 配置位置

- 插件：`@cortexkit/opencode-magic-context@latest`（npm，不在本目录）
- Historian：`%USERPROFILE%\.config\cortexkit\magic-context.jsonc`
- OpenCode 需关闭自带 compaction：`compaction.auto/prune = false`
