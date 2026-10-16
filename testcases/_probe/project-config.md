# OpenCode 活配置（本仓库绑定，不写进 skill）

```yaml
project: OpenCode
env_prefix: OC
execution_driver: web-e2e
execution_tool: Playwright
frontend_dir: packages/app
module_map: testcases/_probe/module-map.md
golden_dir: assets/
testcases_dir: testcases/
auth: none
env_gate: local-direct
deep_link_rule: base_url.rstrip('/') + app_path.rstrip('/') + route
local_defaults:
  base_url: http://127.0.0.1:4444/
  app_path: /
  fallback_urls:
    - http://127.0.0.1:3000/
```

无门户登录。`USER`/`PWD` 可省略。本地执行时首选 4444，不可达再探测 3000（Playwright webServer）。
