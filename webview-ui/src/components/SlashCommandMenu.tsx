/**
 * SlashCommandMenu - Floating autocomplete menu for slash commands.
 *
 * Renders a positioned overlay above the chat input, showing filtered
 * slash commands with keyboard navigation and mouse interaction support.
 * Parent controls visibility and the filtered command list; this component
 * exposes imperative navigation methods via ref.
 *
 * Features:
 * - Loading state with spinner
 * - Empty states (no commands / no match)
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
import type { SlashCommand } from '../utils/slashCommands';

export interface SlashCommandMenuHandle {
  /** Move the highlight up one item (wraps around). */
  moveUp: () => void;
  /** Move the highlight down one item (wraps around). */
  moveDown: () => void;
  /** Trigger onSelect with the currently highlighted command. */
  selectCurrent: () => void;
  /** Return the currently highlighted command, or undefined if none. */
  getSelectedCommand: () => SlashCommand | undefined;
}

interface SlashCommandMenuProps {
  /** Filtered list of commands to display in the menu. */
  commands: SlashCommand[];
  /** Whether the menu should be shown. */
  visible: boolean;
  /** Whether commands are currently being fetched. */
  loading: boolean;
  /** Current slash command query text (without the leading slash). */
  query: string;
  /** Called when a command is selected (via keyboard or click). */
  onSelect: (command: SlashCommand) => void;
  /** Called when the menu should close (e.g. click outside). */
  onClose: () => void;
}

/** Padding from the top of the viewport (px). */
const VIEWPORT_TOP_PADDING = 8;
/** Maximum allowed menu height (px). */
const MAX_HEIGHT_CAP = 300;
/** Minimum allowed menu height (px). */
const MIN_HEIGHT_CAP = 120;

export const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, SlashCommandMenuProps>(
  function SlashCommandMenu({ commands, visible, loading, query, onSelect, onClose }, ref) {
    const [highlightIndex, setHighlightIndex] = useState(0);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    const menuRef = useRef<HTMLDivElement>(null);

    // Reset highlight when the command list changes
    useEffect(() => {
      setHighlightIndex(0);
    }, [commands]);

    // Scroll the active item into view when highlight changes
    useEffect(() => {
      const el = itemRefs.current[highlightIndex];
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
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
      return () => {
        document.removeEventListener('pointerdown', handlePointerDown);
      };
    }, [visible, onClose]);

    // Dynamic max-height based on available viewport space above the menu
    useLayoutEffect(() => {
      if (!visible || !menuRef.current) return;

      const rafId = requestAnimationFrame(() => {
        const el = menuRef.current;
        if (!el) return;

        const rect = el.getBoundingClientRect();
        // The menu is positioned above the input (bottom: calc(100% + 4px)),
        // so rect.bottom is approximately the top edge of the input area.
        // Available space is from the top of the viewport to the menu's bottom.
        const available = rect.bottom - VIEWPORT_TOP_PADDING;
        const clamped = Math.max(MIN_HEIGHT_CAP, Math.min(MAX_HEIGHT_CAP, available));
        el.style.setProperty('--slash-menu-max-height', `${clamped}px`);
      });

      return () => cancelAnimationFrame(rafId);
    }, [visible]);

    const moveUp = useCallback(() => {
      setHighlightIndex((prev) => (prev <= 0 ? commands.length - 1 : prev - 1));
    }, [commands.length]);

    const moveDown = useCallback(() => {
      setHighlightIndex((prev) => (prev >= commands.length - 1 ? 0 : prev + 1));
    }, [commands.length]);

    const selectCurrent = useCallback(() => {
      const cmd = commands[highlightIndex];
      if (cmd) {
        onSelect(cmd);
      }
    }, [commands, highlightIndex, onSelect]);

    const getSelectedCommand = useCallback((): SlashCommand | undefined => {
      return commands[highlightIndex];
    }, [commands, highlightIndex]);

    useImperativeHandle(
      ref,
      () => ({ moveUp, moveDown, selectCurrent, getSelectedCommand }),
      [moveUp, moveDown, selectCurrent, getSelectedCommand],
    );

    // Not visible at all
    if (!visible) {
      return null;
    }

    // Loading state: show spinner
    if (loading && commands.length === 0) {
      return (
        <div ref={menuRef} className="slash-menu" role="status">
          <div className="slash-menu__loading">
            <div className="slash-menu__spinner" />
            <span>Loading commands…</span>
          </div>
        </div>
      );
    }

    // Empty states
    if (commands.length === 0) {
      const message = query === '' ? 'No commands available' : 'No matching commands';
      return (
        <div ref={menuRef} className="slash-menu" role="status">
          <div className="slash-menu__empty">{message}</div>
        </div>
      );
    }

    // Keep the refs array in sync with the command list length
    itemRefs.current = itemRefs.current.slice(0, commands.length);

    return (
      <div ref={menuRef} className="slash-menu" role="listbox">
        {commands.map((cmd, index) => (
          <div
            key={cmd.name}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            role="option"
            aria-selected={index === highlightIndex}
            className={
              `slash-menu__item${index === highlightIndex ? ' slash-menu__item--active' : ''}`
            }
            onMouseEnter={() => setHighlightIndex(index)}
            onClick={() => onSelect(cmd)}
          >
            <span className="slash-menu__name">/{cmd.name}</span>
            {cmd.description && (
              <span className="slash-menu__desc">{cmd.description}</span>
            )}
            {cmd.source === 'api' && (
              <span className="slash-menu__source">api</span>
            )}
          </div>
        ))}
        <div className="slash-menu__footer" aria-label="Keyboard shortcuts: Arrow keys to navigate, Enter to select, Escape to close">
          {loading && <span className="slash-menu__loading-hint">Loading…</span>}
          <kbd>↑↓</kbd> Navigate
          <span className="slash-menu__footer-sep">·</span>
          <kbd>Enter</kbd> Select
          <span className="slash-menu__footer-sep">·</span>
          <kbd>Esc</kbd> Close
        </div>
      </div>
    );
  },
);
