# VSCode Webview Settings UI Best Practices Research

> Research Date: March 2026
> Status: Current as of VSCode 1.98+

## Executive Summary

**Critical Finding:** The official VSCode Webview UI Toolkit has been **deprecated as of January 6, 2025**. Microsoft has archived the repository and is no longer accepting contributions.

**Recommendations:**
- ❌ **Do not use** the official `@vscode/webview-ui-toolkit` for new projects
- ✅ **Use** `vscrui` - a community-maintained React alternative (or build custom with CSS variables)
- ✅ **Leverage** VSCode's native CSS variables for consistent theming
- ✅ **Consider** hybrid approaches: built-in `contributes.configuration` for simple settings + custom webview for complex configurations

---

## 1. VSCode Webview UI Toolkit Status

### Deprecation Details

| Aspect | Status |
|--------|--------|
| **Deprecation Date** | January 6, 2025 |
| **Repository Status** | Archived (read-only) |
| **Issue Reference** | [#561](https://github.com/microsoft/vscode-webview-ui-toolkit/issues/561) |
| **Underlying Tech** | FAST Foundation (also deprecated) |
| **Maintenance Mode** | Security fixes only until full sunsetting |

### Why It Was Deprecated

1. **FAST Foundation** (the underlying web components framework) was deprecated by its maintainers
2. Low community adoption compared to expectations
3. Maintenance burden outweighed benefits

---

## 2. Recommended Alternatives for React

### vscrui - Community-Maintained React Wrapper

**vscrui** is a community-maintained React wrapper that provides VSCode-native UI components.

```bash
npm install vscrui
```

**Required CSS Import:**
```typescript
import 'vscrui/dist/codicon.css';
```

#### Available Components

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `Badge` | Status indicators | `children` |
| `Button` | Action buttons | `appearance: 'primary' \| 'secondary' \| 'icon'` |
| `Checkbox` | Boolean toggles | `checked`, `onChange` |
| `Divider` | Visual separators | — |
| `Dropdown` | Selection dropdowns | `options: string[] \| {id, value}[]` |
| `Icon` | Codicons integration | `name`, `size`, `spin` |
| `Label` | Form labels | `children` |
| `Loader` | Loading states | — |
| `Pane` | Collapsible panels | `title`, `actions` |
| `Panels` / `Tabs` | Tab navigation | — |
| `Table` / `TableRow` / `TableCell` | Data tables | — |
| `Tag` | Categorized labels | — |
| `TextArea` | Multi-line input | `value`, `onChange` |
| `TextField` | Single-line input | `value`, `onChange`, placeholder support |

### Alternative: Custom CSS with VSCode Variables

For our project, since we already have a comprehensive design token system (`theme.css`), **building custom components using VSCode CSS variables** is likely the best approach. This avoids adding a dependency and gives us full control.

---

## 3. VSCode CSS Variables / Design Tokens

VSCode exposes **500+ theme colors** as CSS variables in the format `--vscode-{token-name}`.

### Theme Detection Classes

| Class | Theme Type |
|-------|------------|
| `vscode-light` | Light themes |
| `vscode-dark` | Dark themes |
| `vscode-high-contrast` | High contrast themes |

### Essential CSS Variables Reference

#### Editor Colors
```css
--vscode-editor-background        /* Main editor background */
--vscode-editor-foreground        /* Main editor text color */
--vscode-editor-font-family       /* Editor font family */
--vscode-editor-font-size         /* Editor font size */
```

#### UI Colors
```css
--vscode-foreground               /* Primary foreground */
--vscode-descriptionForeground    /* Secondary/descriptive text */
--vscode-errorForeground          /* Error text */
--vscode-errorBackground          /* Error background */
--vscode-warningForeground        /* Warning text */
--vscode-infoForeground           /* Info text */
```

#### Interactive Elements
```css
--vscode-button-background        /* Button background */
--vscode-button-foreground        /* Button text */
--vscode-button-hoverBackground   /* Button hover state */
--vscode-button-border            /* Button border */
--vscode-button-secondaryBackground
--vscode-button-secondaryForeground
--vscode-button-secondaryHoverBackground

--vscode-input-background         /* Input field background */
--vscode-input-foreground         /* Input text */
--vscode-input-border             /* Input border */
--vscode-input-placeholderForeground /* Placeholder text */

--vscode-focusBorder              /* Focus indicator */
```

#### Panel & Lists
```css
--vscode-panel-border             /* Panel border color */
--vscode-panel-background         /* Panel background */
--vscode-sideBar-background       /* Sidebar background */
--vscode-list-hoverBackground     /* List item hover */
--vscode-list-activeSelectionBackground
--vscode-list-activeSelectionForeground
```

#### Badges & Tags
```css
--vscode-badge-background         /* Badge background */
--vscode-badge-foreground         /* Badge text */
```

---

## 4. Native Settings UI Patterns

### VSCode Settings UI Layout Analysis

```
┌─────────────────────────────────────────┐
│ 🔍 Search settings...                   │  <- Search bar (sticky)
├──────────┬──────────────────────────────┤
│          │                              │
│ Categories│  Setting Group Header        │  <- Sidebar + Main content
│ Sidebar   │  ─────────────────────       │
│           │                              │
│ • General │  ⚪ Toggle Setting           │  <- Toggle controls for booleans
│ • Editor  │  Description text            │
│ • Workbench│                             │
│ ...       │  ┌──────────────────┐       │
│           │  │ Input field      │       │  <- Text inputs with placeholders
│           │  └──────────────────┘       │
│           │                              │
│           │  Setting Group Header        │  <- Clear section headers
│           │  ─────────────────────       │
│           │  [Dropdown ▼]               │  <- Dropdowns for enums
│           │                              │
└──────────┴──────────────────────────────┘
```

### Key Patterns

1. **Search-first**: Prominent search bar at top
2. **Two-column layout**: Categories on left, settings on right
3. **Grouped sections**: Related settings under clear headers
4. **Toggle preference**: Use switches instead of checkboxes for booleans
5. **Inline descriptions**: Explain what each setting does directly below
6. **Visual hierarchy**: Clear distinction between section header, setting name, description

---

## 5. Codicons (VSCode Built-in Icons)

### Setup

```bash
npm install @vscode/codicons
```

### Usage in Webview

```html
<link href="${codiconsUri}" rel="stylesheet">
<i class="codicon codicon-settings"></i>
```

### Icon Categories for Settings UI

| Category | Icons | Usage |
|----------|-------|-------|
| **Settings** | `settings`, `settings-gear`, `gear` | Settings pages |
| **Connection** | `plug`, `globe`, `server`, `cloud` | Server/connection settings |
| **Chat** | `comment`, `comment-discussion` | Chat display settings |
| **Models** | `hubot`, `symbol-method`, `sparkle` | AI model selection |
| **Integration** | `extensions`, `package`, `terminal` | MCP/integrations |
| **Security** | `shield`, `lock`, `key` | Permissions |
| **Actions** | `check`, `close`, `add`, `remove`, `edit`, `save` | Form actions |
| **Status** | `info`, `warning`, `error`, `check-all` | Validation states |
| **Navigation** | `chevron-right`, `chevron-down` | Expand/collapse |

Full gallery: https://microsoft.github.io/vscode-codicons/dist/codicon.html

---

## 6. Design Best Practices

### Layout

- **8px grid system**: All spacing as multiples of 8px (8, 16, 24, 32)
- **Max content width**: 700-900px, centered
- **Sidebar**: 200-240px fixed width
- **Responsive**: Stack vertically on narrow viewport

### Form Elements

- **Toggles over checkboxes** for on/off states
- **Inline validation** with clear error messages
- **Placeholders** as hints, NOT as labels
- **Grouped settings** under clear section headers

### Visual Hierarchy

1. **Page title** (h1) → Section header (h2) → Setting label → Description
2. **Primary action** = filled button, **Secondary** = outline, **Destructive** = red variant
3. **Cards** for grouped content, subtle border + rounded corners
4. **Dividers** between major sections (not between individual settings)

### Accessibility

- All interactive elements need `focus-visible` outlines
- Proper ARIA labels on icon-only buttons
- Keyboard navigation for tabs (arrow keys)
- High contrast theme support via `vscode-high-contrast` class

---

## 7. Current Settings Page Problems (OpenCode Extension)

### Critical Issues
1. **Unicode icons** (⊙◉✦⚡⛨) instead of Codicons — inconsistent rendering
2. **Massive IntegrationsTab** (1045 lines) — needs splitting
3. **No keyboard navigation** in tab sidebar

### Visual Issues
4. **Duplicate header** — tab label shown twice (eyebrow + title)
5. **Inconsistent spacing** — gaps vary: 8px, 10px, 12px, 14px
6. **Flat structure** — no visual separation between sections
7. **Non-native feel** — custom dropdown/toggle don't match VS Code

### Accessibility Issues
8. **Missing focus indicators** on many elements
9. **No ARIA live regions** for dynamic status updates
10. **Placeholder-only labels** in ConnectionTab

---

## 8. References

| Resource | URL |
|----------|-----|
| VSCode Webview API | https://code.visualstudio.com/api/extension-guides/webview |
| Theme Color Reference | https://code.visualstudio.com/api/references/theme-color |
| vscrui | https://github.com/estruyf/vscrui |
| Codicons Gallery | https://microsoft.github.io/vscode-codicons/dist/codicon.html |
| Toolkit Deprecation | https://github.com/microsoft/vscode-webview-ui-toolkit/issues/561 |
