# Module map — OpenCode App

| 系统 | id 前缀 | 前端目录 | app_path | local port | 备注 |
|------|---------|----------|----------|------------|------|
| OpenCode App | OC | packages/app | / | 4444（fallback 3000） | Vite；后端常见 4096 |

| 模块 | 缩写 | 路由/入口 | 菜单 | 后端入口 | 冒烟用例 |
|------|------|-----------|------|----------|----------|
| 工作区侧栏/会话 Tab | WS | /server/{server}/session/{id} | 左侧「项目」+ titlebar「新建会话」 | 前端 openSessionTab / prompt mode | QA-OC-WS-001、QA-OC-WS-002 |

Deep link：`${OC_BASE_URL}` + `/server/<base64(server)>/session/<sessionId>`
