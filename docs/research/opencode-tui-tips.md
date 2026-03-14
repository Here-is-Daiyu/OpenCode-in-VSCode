# OpenCode TUI Startup Tips

> Source: `packages/opencode/src/cli/cmd/tui/component/tips.tsx`
>
> Last synced: 2026-03-14 (commit `f2d3a4c70` on `dev`)

## Overview

- OpenCode TUI 启动时会随机展示一条 tip，格式为 `● Tip <message>`
- 共 **101** 条，存储在 `TIPS` 常量数组中
- 使用 `{highlight}...{/highlight}` 语法高亮关键字（TUI 渲染时高亮显示）
- 首次使用（无 session 历史）时不显示 tips
- 用户可通过 Command Palette 或 `<leader>h` 切换显示/隐藏
- 第 12 条 tip（theme 相关）是动态生成的，会计算内置主题数量

## Tips 分类索引

### Input & Prompting

| # | Tip |
|---|-----|
| 1 | Type `@` followed by a filename to fuzzy search and attach files |
| 2 | Start a message with `!` to run shell commands directly (e.g., `!ls -la`) |
| 7 | Drag and drop images into the terminal to add them as context |
| 8 | Press `Ctrl+V` to paste images from your clipboard into the prompt |
| 9 | Press `Ctrl+X E` or `/editor` to compose messages in your external editor |
| 26 | Press `Shift+Enter` or `Ctrl+J` to add newlines in your prompt |
| 27 | Press `Ctrl+C` when typing to clear the input field |

### Agents & Models

| # | Tip |
|---|-----|
| 3 | Press `Tab` to cycle between Build and Plan agents |
| 11 | Run `/models` or `Ctrl+X M` to see and switch between available AI models |
| 21 | Press `F2` to quickly switch between recently used models |
| 29 | Switch to `Plan` agent to get suggestions without making actual changes |
| 30 | Use `@agent-name` in prompts to invoke specialized subagents |

### Session Management

| # | Tip |
|---|-----|
| 4 | Use `/undo` to revert the last message and file changes |
| 5 | Use `/redo` to restore previously undone messages and file changes |
| 13 | Press `Ctrl+X N` or `/new` to start a fresh conversation session |
| 14 | Use `/sessions` or `Ctrl+X L` to list and continue previous conversations |
| 15 | Run `/compact` to summarize long sessions near context limits |
| 31 | Press `Ctrl+X Right/Left` to cycle through parent and child sessions |
| 99 | Use `/rename` to rename the current session |

### Sharing & Export

| # | Tip |
|---|-----|
| 6 | Run `/share` to create a public link to your conversation at opencode.ai |
| 16 | Press `Ctrl+X X` or `/export` to save the conversation as Markdown |
| 17 | Press `Ctrl+X Y` to copy the assistant's last message to clipboard |
| 82 | Set `"share": "auto"` to automatically share all sessions |
| 83 | Set `"share": "disabled"` to prevent any session sharing |
| 84 | Run `/unshare` to remove a session from public access |

### Navigation & UI

| # | Tip |
|---|-----|
| 18 | Press `Ctrl+P` to see all available actions and commands |
| 22 | Press `Ctrl+X B` to show/hide the sidebar panel |
| 23 | Use `PageUp`/`PageDown` to navigate through conversation history |
| 24 | Press `Ctrl+G` or `Home` to jump to the beginning of the conversation |
| 25 | Press `Ctrl+Alt+G` or `End` to jump to the most recent message |
| 28 | Press `Escape` to stop the AI mid-response |
| 89 | Press `Ctrl+X G` or `/timeline` to jump to specific messages |
| 90 | Press `Ctrl+X H` to toggle code block visibility in messages |
| 91 | Press `Ctrl+X S` or `/status` to see system status info |
| 93 | Toggle username display in chat via command palette (`Ctrl+P`) |
| 98 | Run `/help` or `Ctrl+X H` to show the help dialog |
| 100 | Press `Ctrl+Z` to suspend the terminal and return to your shell |

### Themes

| # | Tip |
|---|-----|
| 12 | Use `/themes` or `Ctrl+X T` to switch between N built-in themes *(dynamic count)* |
| 70 | Use `"theme": "system"` to match your terminal's colors |
| 71 | Create JSON theme files in `.opencode/themes/` directory |
| 72 | Themes support dark/light variants for both modes |
| 73 | Reference ANSI colors 0-255 in custom themes |

### Configuration — General

| # | Tip |
|---|-----|
| 32 | Create `opencode.json` for server settings and `tui.json` for TUI settings |
| 33 | Place TUI settings in `~/.config/opencode/tui.json` for global config |
| 34 | Add `$schema` to your config for autocomplete in your editor |
| 35 | Configure `model` in config to set your default model |
| 74 | Use `{env:VAR_NAME}` syntax to reference environment variables in config |
| 75 | Use `{file:path}` to include file contents in config values |
| 76 | Use `instructions` in config to load additional rules files |

### Configuration — Keybinds

| # | Tip |
|---|-----|
| 20 | The leader key is `Ctrl+X`; combine with other keys for quick actions |
| 36 | Override any keybind in `tui.json` via the `keybinds` section |
| 37 | Set any keybind to `none` to disable it completely |
| 92 | Enable `scroll_acceleration` in `tui.json` for smooth macOS-style scrolling |

### Configuration — Agents

| # | Tip |
|---|-----|
| 43 | Add `.md` files to `.opencode/agent/` for specialized AI personas |
| 44 | Configure per-agent permissions for `edit`, `bash`, and `webfetch` tools |
| 77 | Set agent `temperature` from 0.0 (focused) to 1.0 (creative) |
| 78 | Configure `steps` to limit agentic iterations per request |
| 81 | Override global tool settings per agent configuration |

### Configuration — Permissions

| # | Tip |
|---|-----|
| 45 | Use patterns like `"git *": "allow"` for granular bash permissions |
| 46 | Set `"rm -rf *": "deny"` to block destructive commands |
| 47 | Configure `"git push": "ask"` to require approval before pushing |
| 85 | Permission `doom_loop` prevents infinite tool call loops |
| 86 | Permission `external_directory` protects files outside project |

### Configuration — Tools

| # | Tip |
|---|-----|
| 52 | Create `.ts` files in `.opencode/tools/` to define new LLM tools |
| 53 | Tool definitions can invoke scripts written in Python, Go, etc |
| 79 | Set `"tools": {"bash": false}` to disable specific tools |
| 80 | Set `"mcp_*": false` to disable all tools from an MCP server |

### Configuration — Formatting & LSP

| # | Tip |
|---|-----|
| 48 | OpenCode auto-formats files using prettier, gofmt, ruff, and more |
| 49 | Set `"formatter": false` in config to disable all auto-formatting |
| 50 | Define custom formatter commands with file extensions in config |
| 51 | OpenCode uses LSP servers for intelligent code analysis |

### MCP (Model Context Protocol)

| # | Tip |
|---|-----|
| 38 | Configure local or remote MCP servers in the `mcp` config section |
| 39 | OpenCode auto-handles OAuth for remote MCP servers requiring auth |

### Custom Commands & Plugins

| # | Tip |
|---|-----|
| 40 | Add `.md` files to `.opencode/command/` to define reusable custom prompts |
| 41 | Use `$ARGUMENTS`, `$1`, `$2` in custom commands for dynamic input |
| 42 | Use backticks in commands to inject shell output (e.g., `` `git status` ``) |
| 54 | Add `.ts` files to `.opencode/plugin/` for event hooks |
| 55 | Use plugins to send OS notifications when sessions complete |
| 56 | Create a plugin to prevent OpenCode from reading sensitive files |

### CLI Usage

| # | Tip |
|---|-----|
| 10 | Run `/init` to auto-generate project rules based on your codebase |
| 19 | Run `/connect` to add API keys for 75+ supported LLM providers |
| 57 | Use `opencode run` for non-interactive scripting |
| 58 | Use `opencode --continue` to resume the last session |
| 59 | Use `opencode run -f file.ts` to attach files via CLI |
| 60 | Use `--format json` for machine-readable output in scripts |
| 61 | Run `opencode serve` for headless API access to OpenCode |
| 62 | Use `opencode run --attach` to connect to a running server |
| 63 | Run `opencode upgrade` to update to the latest version |
| 64 | Run `opencode auth list` to see all configured providers |
| 65 | Run `opencode agent create` for guided agent creation |
| 87 | Run `opencode debug config` to troubleshoot configuration |
| 88 | Use `--print-logs` flag to see detailed logs in stderr |
| 94 | Run `docker run -it --rm ghcr.io/anomalyco/opencode` for containerized use |

### GitHub Integration

| # | Tip |
|---|-----|
| 66 | Use `/opencode` in GitHub issues/PRs to trigger AI actions |
| 67 | Run `opencode github install` to set up the GitHub workflow |
| 68 | Comment `/opencode fix this` on issues to auto-create PRs |
| 69 | Comment `/oc` on PR code lines for targeted code reviews |
| 97 | Use `/review` to review uncommitted changes, branches, or PRs |

### Best Practices

| # | Tip |
|---|-----|
| 95 | Use `/connect` with OpenCode Zen for curated, tested models |
| 96 | Commit your project's `AGENTS.md` file to Git for team sharing |

---

## Raw Tips List (Original Order)

For reference, below is the complete list in original array order (1-indexed):

1. Type `@` followed by a filename to fuzzy search and attach files
2. Start a message with `!` to run shell commands directly (e.g., `!ls -la`)
3. Press `Tab` to cycle between Build and Plan agents
4. Use `/undo` to revert the last message and file changes
5. Use `/redo` to restore previously undone messages and file changes
6. Run `/share` to create a public link to your conversation at opencode.ai
7. Drag and drop images into the terminal to add them as context
8. Press `Ctrl+V` to paste images from your clipboard into the prompt
9. Press `Ctrl+X E` or `/editor` to compose messages in your external editor
10. Run `/init` to auto-generate project rules based on your codebase
11. Run `/models` or `Ctrl+X M` to see and switch between available AI models
12. Use `/themes` or `Ctrl+X T` to switch between N built-in themes *(dynamic, based on `DEFAULT_THEMES` count)*
13. Press `Ctrl+X N` or `/new` to start a fresh conversation session
14. Use `/sessions` or `Ctrl+X L` to list and continue previous conversations
15. Run `/compact` to summarize long sessions near context limits
16. Press `Ctrl+X X` or `/export` to save the conversation as Markdown
17. Press `Ctrl+X Y` to copy the assistant's last message to clipboard
18. Press `Ctrl+P` to see all available actions and commands
19. Run `/connect` to add API keys for 75+ supported LLM providers
20. The leader key is `Ctrl+X`; combine with other keys for quick actions
21. Press `F2` to quickly switch between recently used models
22. Press `Ctrl+X B` to show/hide the sidebar panel
23. Use `PageUp`/`PageDown` to navigate through conversation history
24. Press `Ctrl+G` or `Home` to jump to the beginning of the conversation
25. Press `Ctrl+Alt+G` or `End` to jump to the most recent message
26. Press `Shift+Enter` or `Ctrl+J` to add newlines in your prompt
27. Press `Ctrl+C` when typing to clear the input field
28. Press `Escape` to stop the AI mid-response
29. Switch to `Plan` agent to get suggestions without making actual changes
30. Use `@agent-name` in prompts to invoke specialized subagents
31. Press `Ctrl+X Right/Left` to cycle through parent and child sessions
32. Create `opencode.json` for server settings and `tui.json` for TUI settings
33. Place TUI settings in `~/.config/opencode/tui.json` for global config
34. Add `$schema` to your config for autocomplete in your editor
35. Configure `model` in config to set your default model
36. Override any keybind in `tui.json` via the `keybinds` section
37. Set any keybind to `none` to disable it completely
38. Configure local or remote MCP servers in the `mcp` config section
39. OpenCode auto-handles OAuth for remote MCP servers requiring auth
40. Add `.md` files to `.opencode/command/` to define reusable custom prompts
41. Use `$ARGUMENTS`, `$1`, `$2` in custom commands for dynamic input
42. Use backticks in commands to inject shell output (e.g., `` `git status` ``)
43. Add `.md` files to `.opencode/agent/` for specialized AI personas
44. Configure per-agent permissions for `edit`, `bash`, and `webfetch` tools
45. Use patterns like `"git *": "allow"` for granular bash permissions
46. Set `"rm -rf *": "deny"` to block destructive commands
47. Configure `"git push": "ask"` to require approval before pushing
48. OpenCode auto-formats files using prettier, gofmt, ruff, and more
49. Set `"formatter": false` in config to disable all auto-formatting
50. Define custom formatter commands with file extensions in config
51. OpenCode uses LSP servers for intelligent code analysis
52. Create `.ts` files in `.opencode/tools/` to define new LLM tools
53. Tool definitions can invoke scripts written in Python, Go, etc
54. Add `.ts` files to `.opencode/plugin/` for event hooks
55. Use plugins to send OS notifications when sessions complete
56. Create a plugin to prevent OpenCode from reading sensitive files
57. Use `opencode run` for non-interactive scripting
58. Use `opencode --continue` to resume the last session
59. Use `opencode run -f file.ts` to attach files via CLI
60. Use `--format json` for machine-readable output in scripts
61. Run `opencode serve` for headless API access to OpenCode
62. Use `opencode run --attach` to connect to a running server
63. Run `opencode upgrade` to update to the latest version
64. Run `opencode auth list` to see all configured providers
65. Run `opencode agent create` for guided agent creation
66. Use `/opencode` in GitHub issues/PRs to trigger AI actions
67. Run `opencode github install` to set up the GitHub workflow
68. Comment `/opencode fix this` on issues to auto-create PRs
69. Comment `/oc` on PR code lines for targeted code reviews
70. Use `"theme": "system"` to match your terminal's colors
71. Create JSON theme files in `.opencode/themes/` directory
72. Themes support dark/light variants for both modes
73. Reference ANSI colors 0-255 in custom themes
74. Use `{env:VAR_NAME}` syntax to reference environment variables in config
75. Use `{file:path}` to include file contents in config values
76. Use `instructions` in config to load additional rules files
77. Set agent `temperature` from 0.0 (focused) to 1.0 (creative)
78. Configure `steps` to limit agentic iterations per request
79. Set `"tools": {"bash": false}` to disable specific tools
80. Set `"mcp_*": false` to disable all tools from an MCP server
81. Override global tool settings per agent configuration
82. Set `"share": "auto"` to automatically share all sessions
83. Set `"share": "disabled"` to prevent any session sharing
84. Run `/unshare` to remove a session from public access
85. Permission `doom_loop` prevents infinite tool call loops
86. Permission `external_directory` protects files outside project
87. Run `opencode debug config` to troubleshoot configuration
88. Use `--print-logs` flag to see detailed logs in stderr
89. Press `Ctrl+X G` or `/timeline` to jump to specific messages
90. Press `Ctrl+X H` to toggle code block visibility in messages
91. Press `Ctrl+X S` or `/status` to see system status info
92. Enable `scroll_acceleration` in `tui.json` for smooth macOS-style scrolling
93. Toggle username display in chat via command palette (`Ctrl+P`)
94. Run `docker run -it --rm ghcr.io/anomalyco/opencode` for containerized use
95. Use `/connect` with OpenCode Zen for curated, tested models
96. Commit your project's `AGENTS.md` file to Git for team sharing
97. Use `/review` to review uncommitted changes, branches, or PRs
98. Run `/help` or `Ctrl+X H` to show the help dialog
99. Use `/rename` to rename the current session
100. Press `Ctrl+Z` to suspend the terminal and return to your shell
