/**
 * MarkdownRenderer – renders markdown content into themed HTML.
 *
 * Features:
 *  - Shiki-powered syntax highlighting (CSS Variables theme → auto-matches any VS Code theme)
 *  - KaTeX math rendering (inline `$...$` and block `$$...$$`)
 *  - Copy button injected into every code block
 *  - Language label on fenced code blocks
 *  - Intercepts link clicks to open files in the editor
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { initMarkdownRenderer, isReady, renderMarkdown } from '../utils/markdown';
import { postMessage } from '../utils/vscodeApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MarkdownRendererProps {
  /** Raw markdown text to render. */
  content: string;
  /** Optional additional CSS class names. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MarkdownRenderer = React.memo(function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(isReady());

  // ------ Initialise renderer on first mount (lazy, singleton) -------------
  useEffect(() => {
    if (!ready) {
      initMarkdownRenderer().then(() => setReady(true));
    }
  }, [ready]);

  // ------ Render markdown to HTML -----------------------------------------
  const html = useMemo(() => {
    if (!ready) return null;
    return renderMarkdown(content);
  }, [content, ready]);

  // ------ Inject copy buttons + language labels into <pre> blocks ---------
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !html) return;

    const codeBlocks = container.querySelectorAll<HTMLPreElement>('pre');
    codeBlocks.forEach((pre) => {
      // Avoid double-wrapping
      if (pre.parentElement?.classList.contains('code-block-wrapper')) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';
      pre.parentNode?.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      // Language label
      const code = pre.querySelector('code');
      const langMatch = code?.className?.match(/language-(\S+)/);
      if (langMatch) {
        const langLabel = document.createElement('span');
        langLabel.className = 'code-block-lang';
        langLabel.textContent = langMatch[1];
        wrapper.insertBefore(langLabel, pre);
      }

      // Copy button
      const btn = document.createElement('button');
      btn.className = 'code-block-copy-btn';
      btn.textContent = 'Copy';
      btn.title = 'Copy code';
      btn.addEventListener('click', () => {
        const text = code?.textContent ?? pre.textContent ?? '';
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = 'Copy';
          }, 2000);
        });
      });
      wrapper.appendChild(btn);
    });
  }, [html]);

  // ------ Intercept link clicks -------------------------------------------
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a');
    if (!link) return;

    e.preventDefault();
    const href = link.getAttribute('href');
    if (!href) return;

    // File-path links → open in editor
    if (href.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(href)) {
      postMessage({ type: 'file:open', data: { path: href } });
    }
    // Could add external-URL handling here in the future
  }, []);

  // ------ Fallback while Shiki is loading ---------------------------------
  if (!ready || !html) {
    return (
      <div className={`markdown-content markdown-content--loading ${className ?? ''}`}>
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{content}</pre>
      </div>
    );
  }

  // ------ Primary render --------------------------------------------------
  return (
    <div
      ref={containerRef}
      className={`markdown-content ${className ?? ''}`}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
