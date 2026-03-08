import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import markedShiki from 'marked-shiki';

function getShikiLangs() {
  return [
    import('@shikijs/langs/javascript'),
    import('@shikijs/langs/typescript'),
    import('@shikijs/langs/python'),
    import('@shikijs/langs/shellscript'),
    import('@shikijs/langs/shellsession'),
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
  ];
}

type Entry = {
  source: string;
  html: string;
};

const CACHE_MAX = 200;
const CACHE = new Map<string, Entry>();
const TEXT_LANG = 'text';
const SHIKI_THEME = 'css-variables';
const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true, mathMl: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ['style'],
  FORBID_CONTENTS: ['style', 'script'],
};

let md: Marked | null = null;
let ready = false;
let initPromise: Promise<void> | null = null;
let sanitizeHooked = false;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(text: string): string {
  return escapeHtml(text);
}

function fallback(markdown: string): string {
  return `<pre data-markdown-fallback="true" style="white-space:pre-wrap;margin:0">${escapeHtml(markdown)}</pre>`;
}

function touch(key: string, entry: Entry): void {
  CACHE.delete(key);
  CACHE.set(key, entry);

  if (CACHE.size <= CACHE_MAX) {
    return;
  }

  const first = CACHE.keys().next().value;
  if (!first) {
    return;
  }

  CACHE.delete(first);
}

function sanitize(html: string): string {
  if (!DOMPurify.isSupported) {
    return '';
  }

  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

function ensureSanitizeHooks(): void {
  if (sanitizeHooked || typeof window === 'undefined' || !DOMPurify.isSupported) {
    return;
  }

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof HTMLAnchorElement)) {
      return;
    }

    if (node.target !== '_blank') {
      return;
    }

    const rel = node.getAttribute('rel') ?? '';
    const set = new Set(rel.split(/\s+/).filter(Boolean));
    set.add('noopener');
    set.add('noreferrer');
    node.setAttribute('rel', Array.from(set).join(' '));
  });

  sanitizeHooked = true;
}

function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function getLanguageLabel(lang: string): string {
  return lang.trim();
}

function injectLanguage(html: string, lang: string): string {
  if (!lang) {
    return html;
  }

  return html.replace(/<pre(?![^>]*\bdata-language=)([^>]*)>/, `<pre data-language="${escapeAttribute(lang)}"$1>`);
}

function fallbackCodeBlock(code: string, lang: string): string {
  const cls = lang ? ` class="language-${escapeAttribute(lang)}"` : '';
  const pre = lang ? `<pre data-language="${escapeAttribute(lang)}">` : '<pre>';
  return `${pre}<code${cls}>${escapeHtml(code)}</code></pre>`;
}

export async function initMarkdownRenderer(): Promise<void> {
  if (ready) {
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    ensureSanitizeHooks();

    const [
      { createHighlighterCore, createCssVariablesTheme },
      { createJavaScriptRegexEngine },
    ] = await Promise.all([import('shiki/core'), import('shiki/engine/javascript')]);

    const theme = createCssVariablesTheme({
      name: SHIKI_THEME,
      variablePrefix: '--shiki-',
      variableDefaults: {},
    });

    const highlighter = await createHighlighterCore({
      themes: [theme],
      langs: getShikiLangs(),
      engine: createJavaScriptRegexEngine(),
    });

    const next = new Marked({
      async: true,
      breaks: true,
      gfm: true,
    });

    next.use(
      {
        renderer: {
          link({ href, title, tokens }) {
            const text = this.parser.parseInline(tokens);
            if (!href) {
              return text;
            }

            const attrs = [`href="${escapeAttribute(href)}"`];
            if (title) {
              attrs.push(`title="${escapeAttribute(title)}"`);
            }
            if (isExternalHref(href)) {
              attrs.push('class="external-link"', 'target="_blank"', 'rel="noopener noreferrer"');
            }

            return `<a ${attrs.join(' ')}>${text}</a>`;
          },
        },
      },
      markedKatex({
        throwOnError: false,
        nonStandard: true,
      }),
      markedShiki({
        async highlight(code, lang) {
          const label = getLanguageLabel(lang);
          const name = label || TEXT_LANG;

          try {
            return injectLanguage(
              highlighter.codeToHtml(code, {
                lang: name,
                theme: SHIKI_THEME,
              }),
              label,
            );
          } catch (error) {
            console.warn('[markdown] Shiki highlight failed, using plain code block:', error);
            return fallbackCodeBlock(code, label);
          }
        },
      }),
    );

    md = next;
    ready = true;
  })().catch((error) => {
    initPromise = null;
    md = null;
    ready = false;
    throw error;
  });

  return initPromise;
}

export function isReady(): boolean {
  return ready;
}

export async function renderMarkdown(content: string, cacheKey?: string): Promise<string> {
  const source = typeof content === 'string' ? content : '';
  if (!source) {
    return '';
  }

  await initMarkdownRenderer();

  const key = cacheKey?.trim() || source;
  const cached = CACHE.get(key);
  if (cached && cached.source === source) {
    touch(key, cached);
    return cached.html;
  }

  if (!md) {
    return fallback(source);
  }

  try {
    const html = sanitize(await md.parse(source)) || fallback(source);
    touch(key, { source, html });
    return html;
  } catch (error) {
    console.warn('[markdown] Render failed, using fallback:', error);
    return fallback(source);
  }
}
