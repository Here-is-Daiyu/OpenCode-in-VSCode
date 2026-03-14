/**
 * SlashCommandMenu - Floating autocomplete menu for slash commands.
 *
 * Renders a positioned overlay above the chat input, showing filtered
 * slash commands with keyboard navigation and mouse interaction support.
 * Parent controls visibility and the filtered command list; this component
 * exposes imperative navigation methods via ref.
 */

import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
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
  /** Called when a command is selected (via keyboard or click). */
  onSelect: (command: SlashCommand) => void;
}

export const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, SlashCommandMenuProps>(
  function SlashCommandMenu({ commands, visible, onSelect }, ref) {
    const [highlightIndex, setHighlightIndex] = useState(0);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

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

    // Nothing to render
    if (!visible || commands.length === 0) {
      return null;
    }

    // Keep the refs array in sync with the command list length
    itemRefs.current = itemRefs.current.slice(0, commands.length);

    return (
      <div className="slash-menu" role="listbox">
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
      </div>
    );
  },
);
