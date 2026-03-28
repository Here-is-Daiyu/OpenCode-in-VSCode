# OpenCode VSCode Extension — TODO

> 按顺序执行：先补齐参考基线，再做官方行为对齐与核心交互，最后统一做导航与 UI 打磨。

---

## Phase 1: 参考基线与资料同步

- [x] **1. 拉取 OpenChamber 到 `vendor/`**
  将 OpenChamber 也拉到本地 `vendor/` 里作为参考内容。
  *(只做参考，先看实现思路，不直接照搬)*

- [x] **2. 更新参考文档索引**
  在 `AGENTS.md` / `docs/research/` / 相关说明里补充新的参考仓库说明，确保后续排查和实现时有统一入口。

## Phase 2: 设置页与官方行为对齐

- [x] **3. 对齐 opencode 配置文件读取逻辑**
  打开本地 opencode 配置文件的逻辑改为与 opencode 官方读取逻辑完全一致，对齐官方行为；把入口按钮放到设置页里。

- [x] **4. 支持 MCP 开启/关闭**
  在设置页中添加 MCP 服务器的开启和关闭功能。
  *(与设置页改动相邻，建议一起完成以减少来回改 UI)*

## Phase 3: 输入能力与会话控制核心功能

- [x] **5. 支持 `@` 引用文件（TUI 1.2）**
  输入框中用 `@` 符号引用文件，模糊搜索项目文件，文件内容自动加入对话上下文。需先查阅 opencode 源码确认 API / 数据流是否支持。

- [x] **6. 支持 `!` 执行 shell 命令（TUI 1.3）**
  以 `!` 开头的消息作为 shell 命令执行，输出返回给 AI 上下文。需先查阅 opencode 源码确认 API / 数据流是否支持。

- [x] **7. 支持待发送消息队列（参考官方 TUI）**
  - 支持多条待发送消息排队
  - 支持撤回指定待发送消息
  - 撤回后自动恢复到输入框

- [x] **8. 支持暂停**
  参考 `vendor/OpenCodeUI` 与官方实现，补齐暂停中的状态流转与 UI。

- [x] **9. 实现 undo / redo 命令**
  参考 `vendor/OpenCodeUI` 实现。底层依赖 Git 管理文件改动，需要确认 extension 侧如何安全衔接。

## Phase 4: 会话导航与任务视图

- [x] **10. 默认进入最新 session**
  如果当前目录下有历史 session，则默认进入最新的 session，而不是每次都新建。

- [x] **11. 支持点击 task 事件进入 subagent 会话**
  点击 task 事件可进入 subagent 会话，同时在进入 subagent 后添加返回上级的按键。查看 opencode 的实现方式。

- [ ] **12. Task 事件呈现优化**
  参考 `vendor/OpenCodeUI` 优化 task 事件的视觉展示。
  *(与 #11 强关联，紧挨着做)*

## Phase 5: 结果呈现与交互打磨

- [ ] **13. 优化不同工具调用的结果呈现**
  - 单文件编辑：点击后在 VSCode 中打开对应的 diff
  - 读取文件：点击打开对应行
  - `webfetch`：点击链接访问

- [ ] **14. Markdown 链接渲染支持点击访问**
  对话中的 markdown 链接可以直接点击跳转。

- [ ] **15. 宽屏 Last API Response 面板**
  当对话流窗口足够宽（> 对话流最大宽度的 1.5 倍）时，在右侧显示 `last api response in this session`，设计风格和对话流对齐。

---

### 备注

- `vendor/OpenCodeUI` 为 GPL-3.0，仅作参考，不直接复制代码。
- `vendor/OpenChamber` 先以“理解思路 / 对照行为”为目的使用。
- 每当确认新的官方行为或接口细节时，要同步更新 `docs/research/` 中对应文档。
