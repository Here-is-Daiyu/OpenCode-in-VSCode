/**
 * MentionMenu - Floating autocomplete menu for @-mention file references.
 *
 * Renders a positioned overlay above the chat input, showing file/folder
 * search results with keyboard navigation and mouse interaction support.
 * Parent controls visibility and the result list; this component exposes
 * imperative navigation methods via ref.
 *
 * Features:
 * - Loading state with spinner
 * - Empty states (no results / type to search)
 * - Click-outside-to-close
 * - Dynamic max-height based on viewport space
 * - Footer with keyboard navigation hints
 */

import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useState,
} from 'react';
import type { MentionResult } from '../hooks/useMentionSearch';

export interface MentionMenuHandle {
  /** Move the highlight up one item (wraps around). */
  moveUp: () => void;
  /** Move the highlight down one item (wraps around). */
  moveDown: () => void;
  /** Trigger onSelect with the currently highlighted item. */
  selectCurrent: () => void;
}

interface MentionMenuProps {
  /** Search results to display in the menu. */
  results: MentionResult[];
  /** Whether the menu should be shown. */
  visible: boolean;
  /** Whether a search is currently in progress. */
  loading: boolean;
  /** Current mention query text (without the leading @). */
  query: string;
  /** Called when a result is selected (via keyboard or click). */
  onSelect: (result: MentionResult) => void;
  /** Called when the menu should close (e.g. click outside). */
  onClose: () => void;
}

/** Padding from the top of the viewport (px). */
const VIEWPORT_TOP_PADDING = 8;
/** Maximum allowed menu height (px). */
const MAX_HEIGHT_CAP = 260;
/** Minimum allowed menu height (px). */
const MIN_HEIGHT_CAP = 100;

/** Get a simple file extension icon indicator. */
function getFileIcon(name: string, type: 'file' | 'folder'): string {
  if (type === 'folder') return '\u{1F4C1}';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ts': case 'tsx': return '\u{1F7E6}';
    case 'js': case 'jsx': return '\u{1F7E8}';
    case 'css': case 'scss': return '\u{1F3A8}';
    case 'json': return '\u{1F4CB}';
    case 'md': return '\u{1F4DD}';
    case 'py': return '\u{1F40D}';
    case 'rs': return '\u{1F980}';
    case 'go': return '\u{1F537}';
    default: return '\u{1F4C4}';
  }
}

export const MentionMenu = forwardRef<MentionMenuHandle, MentionMenuProps>(
  function MentionMenu({ results, visible, loading, query, onSelect, onClose }, ref) {
    const [highlightIndex, setHighlightIndex] = useState(0);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    const menuRef = useRef<HTMLDivElement>(null);

    // Reset highlight when results change
    useEffect(() => {
      setHighlightIndex(0);
    }, [results]);

    // Scroll active item into view
    useEffect(() => {
      const el = itemRefs.current[highlightIndex];
      if (el) el.scrollIntoView({ block: 'nearest' });
    }, [highlightIndex]);

    // Click-outside-to-close
    useEffect(() => {
      if (!visible) return;
      const handlePointerDown = (e: PointerEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          onClose();
        }
      };
      document.addEventListener('pointerdown', handlePointerDown);
      return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [visible, onClose]);

    // Dynamic max-height based on available viewport space above the menu
    useLayoutEffect(() => {
      if (!visible || !menuRef.current) return;
      const rafId = requestAnimationFrame(() => {
        const el = menuRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const available = rect.bottom - VIEWPORT_TOP_PADDING;
        const clamped = Math.max(MIN_HEIGHT_CAP, Math.min(MAX_HEIGHT_CAP, available));
        el.style.setProperty('--mention-menu-max-height', `${clamped}px`);
      });
      return () => cancelAnimationFrame(rafId);
    }, [visible]);

    const moveUp = useCallback(() => {
      setHighlightIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
    }, [results.length]);

    const moveDown = useCallback(() => {
      setHighlightIndex((prev) => (prev >= results.length - 1 ? 0 : prev + 1));
    }, [results.length]);

    const selectCurrent = useCallback(() => {
      const item = results[highlightIndex];
      if (item) onSelect(item);
    }, [results, highlightIndex, onSelect]);

    useImperativeHandle(ref, () => ({ moveUp, moveDown, selectCurrent }), [moveUp, moveDown, selectCurrent]);

    if (!visible) return null;

    // Loading state
    if (loading && results.length === 0) {
      return (
        <div ref={menuRef} className="mention-menu" role="status">
          <div className="mention-menu__loading">
            <div className="mention-menu__spinner" />
            <span>Searching files\u2026</span>
          </div>
        </div>
      );
    }

    // Empty state: query but no results
    if (results.length === 0 && query) {
      return (
        <div ref={menuRef} className="mention-menu" role="status">
          <div className="mention-menu__empty">No files found</div>
        </div>
      );
    }

    // Empty state: no query yet
    if (results.length === 0) {
      return (
        <div ref={menuRef} className="mention-menu" role="status">
          <div className="mention-menu__empty">Type to search files\u2026</div>
        </div>
      );
    }

    // Keep the refs array in sync with the results length
    itemRefs.current = itemRefs.current.slice(0, results.length);

    return (
      <div ref={menuRef} className="mention-menu" role="listbox">
        {results.map((item, index) => (
          <div
            key={item.path}
            ref={(el) => { itemRefs.current[index] = el; }}
            role="option"
            aria-selected={index === highlightIndex}
            className={`mention-menu__item${index === highlightIndex ? ' mention-menu__item--active' : ''}`}
            onMouseEnter={() => setHighlightIndex(index)}
            onClick={() => onSelect(item)}
          >
            <span className="mention-menu__icon">{getFileIcon(item.name, item.type)}</span>
            <span className="mention-menu__name">{item.name}</span>
            <span className="mention-menu__path">{item.path}</span>
          </div>
        ))}
        <div className="mention-menu__footer" aria-label="Keyboard shortcuts: Arrow keys to navigate, Enter to select, Escape to close">
          <kbd>&uarr;&darr;</kbd> Navigate
          <span className="mention-menu__footer-sep">&middot;</span>
          <kbd>Enter</kbd> Select
          <span className="mention-menu__footer-sep">&middot;</span>
          <kbd>Esc</kbd> Close
        </div>
      </div>
    );
  },
);
