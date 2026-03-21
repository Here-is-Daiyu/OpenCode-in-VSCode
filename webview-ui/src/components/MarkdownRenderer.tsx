import morphdom from 'morphdom';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { isReady, renderMarkdown } from '../utils/markdown';
import { postMessage } from '../utils/vscodeApi';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  cacheKey?: string;
}

function getLanguage(block: HTMLPreElement): string {
  const label = block.dataset.language?.trim();
  if (label) {
    return label;
  }

  const code = block.querySelector('code');
  const match = code?.className.match(/language-([^\s]+)/);
  return match?.[1] ?? '';
}

function decorate(root: HTMLDivElement): void {
  // Wrap code blocks
  const blocks = Array.from(root.querySelectorAll('pre'));
  for (const block of blocks) {
    if (block.dataset.markdownFallback === 'true') {
      continue;
    }

    const parent = block.parentElement;
    if (!parent) {
      continue;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    parent.replaceChild(wrapper, block);
    wrapper.appendChild(block);

    const lang = getLanguage(block);
    if (lang) {
      const label = document.createElement('span');
      label.className = 'code-block-lang';
      label.textContent = lang;
      wrapper.insertBefore(label, block);
    }

    const button = document.createElement('button');
    button.className = 'code-block-copy-btn';
    button.type = 'button';
    button.title = 'Copy code';
    button.textContent = 'Copy';
    wrapper.appendChild(button);
  }

  // Wrap tables in overflow container
  const tables = Array.from(root.querySelectorAll('table'));
  for (const table of tables) {
    const parent = table.parentElement;
    if (!parent || parent.classList.contains('table-wrapper')) {
      continue;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';
    parent.replaceChild(wrapper, table);
    wrapper.appendChild(table);
  }
}

function setFallback(root: HTMLDivElement, content: string): void {
  const pre = document.createElement('pre');
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.margin = '0';
  pre.textContent = content;
  root.replaceChildren(pre);
}

function patch(root: HTMLDivElement, html: string): void {
  if (!html) {
    root.replaceChildren();
    return;
  }

  const temp = document.createElement('div');
  temp.innerHTML = html;
  decorate(temp);

  morphdom(root, temp, {
    childrenOnly: true,
    onBeforeElUpdated: (fromEl, toEl) => {
      if (fromEl.isEqualNode(toEl)) {
        return false;
      }

      return true;
    },
  });
}

export const MarkdownRenderer = React.memo(function MarkdownRenderer({
  content,
  className,
  cacheKey,
}: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasRenderedRef = useRef(false);
  const timeoutsRef = useRef(new Map<HTMLButtonElement, number>());
  const [loading, setLoading] = useState(() => !isReady());

  useEffect(() => {
    return () => {
      for (const timeout of timeoutsRef.current.values()) {
        window.clearTimeout(timeout);
      }
      timeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) {
      return;
    }

    let cancelled = false;

    if (!hasRenderedRef.current) {
      setFallback(root, content);
      setLoading(true);
    }

    void renderMarkdown(content, cacheKey)
      .then((html) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        patch(containerRef.current, html);
        hasRenderedRef.current = true;
        setLoading(false);
      })
      .catch((error) => {
        console.warn('[markdown] Component render failed:', error);
        if (cancelled || !containerRef.current || hasRenderedRef.current) {
          return;
        }

        setFallback(containerRef.current, content);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, content]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const button = target.closest<HTMLButtonElement>('.code-block-copy-btn');
    if (button) {
      event.preventDefault();
      event.stopPropagation();

      const code = button.closest('.code-block-wrapper')?.querySelector('code');
      const text = code?.textContent ?? '';
      if (!text || !navigator.clipboard) {
        return;
      }

      void navigator.clipboard.writeText(text).then(() => {
        button.textContent = 'Copied!';

        const existing = timeoutsRef.current.get(button);
        if (existing) {
          window.clearTimeout(existing);
        }

        const timeout = window.setTimeout(() => {
          button.textContent = 'Copy';
          timeoutsRef.current.delete(button);
        }, 2000);

        timeoutsRef.current.set(button, timeout);
      });

      return;
    }

    const link = target.closest<HTMLAnchorElement>('a');
    const href = link?.getAttribute('href')?.trim();
    if (!href) {
      return;
    }

    if (href.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(href)) {
      event.preventDefault();
      postMessage({ type: 'file:open', data: { path: href } });
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`markdown-content ${loading ? 'markdown-content--loading' : ''} ${className ?? ''}`.trim()}
      onClick={handleClick}
    />
  );
});
