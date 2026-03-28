# 本地参考仓库索引

> 目的：统一说明 `vendor/` 下各参考仓库的来源、许可证、适用场景与使用边界，避免后续重复判断喵。

---

## 总览

| 目录 | 来源 | License | 主要用途 | 使用边界 |
|------|------|---------|----------|----------|
| `vendor/opencode-official/` | OpenCode 官方源码 | MIT | 核对 server / CLI / API 官方行为 | 优先用于“事实确认” |
| `vendor/OpenChamber/` | <https://github.com/openchamber/openchamber> | MIT | 参考 settings、session UX、terminal、VS Code/runtime 交互方案 | 借鉴结构和思路，避免直接搬运 |
| `vendor/continue/` | Continue 扩展源码 | Apache-2.0 | 参考 VS Code extension / webview 集成模式 | 以模式借鉴为主 |
| `vendor/OpenCodeUI/` | 社区 OpenCode Desktop WebUI | GPL-3.0 | 仅供观察 UI / 交互思路 | **禁止直接复制代码** |

---

## 推荐查阅顺序

### 1. 官方行为 / API / 配置逻辑

1. `docs/research/opencode-api-reference.md`
2. `vendor/opencode-official/`
3. 本地 live instance `http://127.0.0.1:23452`

### 2. VS Code / Webview / Settings / 会话体验

1. 本仓库现有实现
2. `vendor/OpenChamber/`
3. `vendor/continue/`
4. `vendor/OpenCodeUI/`（仅看思路，不抄代码）

### 3. TUI 交互 / 命令 / 会话流

1. `vendor/opencode-official/`
2. `docs/research/opencode-tui-tips.md`

---

## 备注

- `vendor/` 目录仅用于本地参考，不纳入提交内容。
- 若从这些仓库确认了新的接口、行为或交互结论，必须同步写回 `docs/research/` 对应文档。
- 涉及 GPL-3.0 参考仓库时，只能抽取思路、不能复制实现。
