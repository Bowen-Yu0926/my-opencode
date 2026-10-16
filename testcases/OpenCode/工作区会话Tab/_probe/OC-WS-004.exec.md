---
case_id: OC-WS-004
---

## 入口

- 命令：打开项目（Ctrl+O / `project.open`）
- 新建会话：标题栏「新建会话」

## 定位

- 打开项目对话框目录行
- 左侧当前项目行
- 标题栏新建会话

## 代码依据

### 前端

- `workspace-file-panel.tsx`：`project.open` → `homeProjects.project.choose`
- `titlebar.tsx`：`openNewTab` 用当前选中项目目录建草稿

### 后端

- 未找到：本路径为前端工作区状态
