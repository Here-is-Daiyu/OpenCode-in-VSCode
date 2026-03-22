# OpenCode for VSCode - TODO

> 最后更新: 2026-03-22
> 当前工作: 1.0.1 正式版发布收尾
> 备注: 本轮 10 个问题已完成代码修复，当前整理正式版发布内容

## 本轮修复结果

| # | 问题 | 优先级 | 状态 | 备注 |
|---|------|--------|------|------|
| 1 | 去掉连续 assistant message 中间的 `[Image 2]` 占位，并移除 assistant / user 图标 | 高 | 已修复 | 显示层清理 image marker，消息 header 图标移除 |
| 2 | 修复高速滚动时黑屏闪烁 | 高 | 已修复 | 移除 `content-visibility`，提高虚拟列表 overscan |
| 3 | 修复 session 列表日期列打开图标点击报错 | 高 | 已修复 | session tree context menu 仅对真实 session 节点显示 |
| 4 | 修复从 session 列表图标打开后 editor 面板卡在连接态 / 打不开 | 高 | 已修复 | editor panel 缓存初始状态并主动加载 `session:loaded` |
| 5 | 整体对话字体调小，优化 tool 调用展开后的展示 | 中 | 已修复 | chat / message 样式已收紧并优化 tool card |
| 6 | 左侧 MCP 支持右键开启 / 关闭；Providers 仅显示已连接；Formatter 仅显示已启用 | 高 | 已修复 | 新增 MCP enable/disable 命令与 status tree 过滤 |
| 7 | 一键打开 OpenCode Settings 的逻辑与 OpenCode 存储逻辑保持一致，修复当前打不开报错 | 高 | 已修复 | 改为项目目录 `config.json`，不存在时自动创建 |
| 8 | 修复模型选择栏输入后无法正确补全 / 匹配 | 高 | 已修复 | 初始 providers/config 同步补齐，selector 命令支持 webview 参数 |
| 9 | 修复切换 agent 崩溃问题（参考本地崩溃堆栈） | 高 | 已修复 | `Agent.model` 对齐真实 API，agent selector 安全格式化 |
| 10 | 分析本地调试日志是否提供额外线索并纳入修复 | 中 | 已完成 | 日志线索已纳入 #4 / #8 / #9 根因与修复 |

## 验证

- ✅ `npm run typecheck`
- ✅ `npm run build`
- ✅ reviewer 自审通过（修复 status tree 空数据保护与 config 打开路径防护后复审）

## 备注

- 当前未执行 git branch / commit / push；如需按仓库规范新建分支，需雨薇姐姐明确授权。
- 已同步更新 `docs/research/opencode-api-reference.md`，补充 `/config` 的真实落盘位置说明。
- 已清理发布前本地调试文件与 beta 版 VSIX 产物，准备切换到 `1.0.1` 正式版。
