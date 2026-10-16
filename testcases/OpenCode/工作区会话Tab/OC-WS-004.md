---
id: OC-WS-004
title: 打开新项目后新建会话落到该项目
module: OpenCode/工作区会话Tab
priority: P0
type: ui-e2e
env:
  profile: local
  base_url: ${OC_BASE_URL}
  app_path: ${OC_APP_PATH}
  role: 本地开发者
source: packages/app/src/components/workspace-file-panel.tsx project.open; packages/app/src/components/titlebar.tsx openNewTab
version: 2
status: active
automation: packages/app/e2e/regression/panel-new-session-project.spec.ts
---

## 测什么

在已有会话里打开一个新目录作为当前项目，再新建会话。新会话必须属于刚打开的项目，而不是原来的项目。

## 测试步骤与预期

1. 进入项目 A 下的已有会话
   - 预期：当前工作区项目是项目 A

2. 打开一个尚未加入工作区的新目录作为项目
   - 预期：该目录成为当前项目，并出现在项目列表中

3. 新建会话
   - 预期：新会话属于刚打开的项目，不属于项目 A

## 最终结果

- 结果：未执行
