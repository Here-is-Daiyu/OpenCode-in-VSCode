/**
 * Markdown rendering engine with Shiki syntax highlighting and KaTeX math support.
 *
 * Uses the CSS Variables theme so code blocks automatically adapt to any
 * VS Code color theme without reloading the highlighter.
 */

import MarkdownIt from 'markdown-it';
import katex from 'katex';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Languages we want Shiki to load (common set). */
const SHIKI_LANGS = [
  'javascript',
  'typescript',
  'python',
  'bash',
  'shell',
  'json',
  'yaml',
  'html',
  'css',
  'jsx',
  'tsx',
  'markdown',
  'sql',
  'go',
  'rust',
  'java',
  'c',
  'cpp',
  'csharp',
  'ruby',
  'php',
  'swift',
  'kotlin',
  'diff',
  'toml',
  'xml',
  'dockerfile',
  'graphql',
  'prisma',
  'vue',
  'svelte',
] as const;

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let md: MarkdownIt | null = null;
let ready = false;
let initPromise: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// KaTeX plugin for markdown-it
// ---------------------------------------------------------------------------

/**
 * Minimal KaTeX plugin that handles:
 *  - Inline math : `$...$`
 *  - Block  math : `$$...$$`
 *
 * Renders via `katex.renderToString` with `throwOnError: false` so broken
 * LaTeX never crashes the page.
 */
function katexPlugin(mdInstance: MarkdownIt): void {
  // ---- inline rule: $...$ ------------------------------------------------
  mdInstance.inline.ruler.after('escape', 'math_inline', (state, silent) => {
    if (state.src.charAt(state.pos) !== '$') return false;
    // Ensure not $$
    if (state.src.charAt(state.pos + 1) === '$') return false;

    const start = state.pos + 1;
    let end = start;
    while (end < state.posMax) {
      if (state.src.charAt(end) === '$' && state.src.charAt(end - 1) !== '\\') break;
      end++;
    }
    if (end >= state.posMax) return false;

    if (!silent) {
      const token = state.push('math_inline', 'math', 0);
      token.markup = '$';
      token.content = state.src.slice(start, end);
    }

    state.pos = end + 1;
    return true;
  });

  mdInstance.renderer.rules.math_inline = (tokens, idx) => {
    try {
      return katex.renderToString(tokens[idx].content, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      return `<code class="katex-error">${mdInstance.utils.escapeHtml(tokens[idx].content)}</code>`;
    }
  };

  // ---- block rule: $$...$$ -----------------------------------------------
  mdInstance.block.ruler.after('blockquote', 'math_block', (state, startLine, endLine, silent) => {
    const startPos = state.bMarks[startLine] + state.tShift[startLine];
    const maxPos = state.eMarks[startLine];

    if (startPos + 2 > maxPos) return false;
    if (state.src.charAt(startPos) !== '$' || state.src.charAt(startPos + 1) !== '$') return false;

    // Look for closing $$
    let nextLine = startLine;
    let found = false;

    // If $$ is on the same line as content check for closing on same line
    const firstLineContent = state.src.slice(startPos + 2, maxPos).trim();
    if (firstLineContent && firstLineContent.endsWith('$$')) {
      // single-line block math: $$ ... $$
      if (silent) return true;
      const token = state.push('math_block', 'math', 0);
      token.block = true;
      token.content = firstLineContent.slice(0, -2).trim();
      token.map = [startLine, startLine + 1];
      token.markup = '$$';
      state.line = startLine + 1;
      return true;
    }

    for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineMax = state.eMarks[nextLine];
      const lineText = state.src.slice(lineStart, lineMax).trim();
      if (lineText === '$$') {
        found = true;
        break;
      }
    }

    if (!found) return false;
    if (silent) return true;

    const token = state.push('math_block', 'math', 0);
    token.block = true;
    token.markup = '$$';
    token.map = [startLine, nextLine + 1];

    // Collect content lines
    const lines: string[] = [];
    if (firstLineContent) lines.push(firstLineContent);
    for (let i = startLine + 1; i < nextLine; i++) {
      lines.push(state.src.slice(state.bMarks[i] + state.tShift[i], state.eMarks[i]));
    }
    token.content = lines.join('\n');

    state.line = nextLine + 1;
    return true;
  });

  mdInstance.renderer.rules.math_block = (tokens, idx) => {
    try {
      return `<div class="katex-block">${katex.renderToString(tokens[idx].content, {
        throwOnError: false,
        displayMode: true,
      })}</div>\n`;
    } catch {
      return `<pre class="katex-error"><code>${mdInstance.utils.escapeHtml(tokens[idx].content)}</code></pre>\n`;
    }
  };
}

// ---------------------------------------------------------------------------
// Initialization (lazy, singleton)
// ---------------------------------------------------------------------------

/**
 * Initialize the markdown renderer. Safe to call multiple times; subsequent
 * calls return the same promise.
 */
export async function initMarkdownRenderer(): Promise<void> {
  if (ready) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Create base markdown-it instance
    md = new MarkdownIt({
      html: false, // Security: no raw HTML pass-through
      linkify: true,
      breaks: true,
      typographer: false,
    });

    // Register KaTeX plugin
    katexPlugin(md);

    // Try to load Shiki for syntax highlighting
    try {
      const [
        { createHighlighterCore, createCssVariablesTheme },
        { createJavaScriptRegexEngine },
        { fromHighlighter },
      ] = await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
        import('@shikijs/markdown-it/core'),
      ]);

      const cssVarTheme = createCssVariablesTheme({
        name: 'css-variables',
        variablePrefix: '--shiki-',
        variableDefaults: {},
      });

      const highlighter = await createHighlighterCore({
        themes: [cssVarTheme],
        langs: [
          import('@shikijs/langs/javascript'),
          import('@shikijs/langs/typescript'),
          import('@shikijs/langs/python'),
          import('@shikijs/langs/shellscript'),    // bash, sh
          import('@shikijs/langs/shellsession'),   // shell
          import('@shikijs/langs/json'),
          import('@shikijs/langs/yaml'),
          import('@shikijs/langs/html'),
          import('@shikijs/langs/css'),
          import('@shikijs/langs/jsx'),
          import('@shikijs/langs/tsx'),
          import('@shikijs/langs/markdown'),
          import('@shikijs/langs/diff'),
          import('@shikijs/langs/go'),
          import('@shikijs/langs/rust'),
          import('@shikijs/langs/java'),
          import('@shikijs/langs/c'),
          import('@shikijs/langs/cpp'),
          import('@shikijs/langs/csharp'),
          import('@shikijs/langs/ruby'),
          import('@shikijs/langs/php'),
          import('@shikijs/langs/swift'),
          import('@shikijs/langs/kotlin'),
          import('@shikijs/langs/sql'),
          import('@shikijs/langs/toml'),
          import('@shikijs/langs/xml'),
          import('@shikijs/langs/dockerfile'),
          import('@shikijs/langs/graphql'),
          import('@shikijs/langs/prisma'),
          import('@shikijs/langs/vue'),
          import('@shikijs/langs/svelte'),
        ],
        engine: createJavaScriptRegexEngine(),
      });

      // 'text' is a Shiki special language (always available, never needs
      // loading) but it is not part of the BuiltinLanguage type union.
      const TEXT_LANG = 'text' as const;

      // Cast needed: createHighlighterCore returns HighlighterCore (= HighlighterGeneric<never, never>)
      // but fromHighlighter expects HighlighterGeneric<any, any>. This is a known shiki type mismatch.
      md.use(
        fromHighlighter(highlighter as Parameters<typeof fromHighlighter>[0], {
          theme: 'css-variables',
          defaultLanguage: TEXT_LANG as unknown as typeof SHIKI_LANGS[number],
          fallbackLanguage: TEXT_LANG as unknown as typeof SHIKI_LANGS[number],
        }),
      );
    } catch (err) {
      // Shiki failed – fall through with markdown-it's default fence renderer
      // which produces plain <pre><code> blocks.
      console.warn('[markdown] Shiki initialization failed, using plain code blocks:', err);
    }

    ready = true;
  })();

  return initPromise;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Whether the markdown renderer has been fully initialized (Shiki loaded).
 */
export function isReady(): boolean {
  return ready;
}

/**
 * Render a markdown string to HTML.
 *
 * **Must** call `initMarkdownRenderer()` first (or check `isReady()`).
 * If called before init, returns a basic `<pre>` fallback.
 */
export function renderMarkdown(text: string): string {
  if (!md) {
    // Not initialised yet – return escaped plaintext as fallback
    return `<pre style="white-space:pre-wrap;margin:0">${escapeHtml(text)}</pre>`;
  }
  return md.render(text);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
