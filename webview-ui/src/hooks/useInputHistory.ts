/**
 * useInputHistory - Terminal-style input history with ↑↓ navigation.
 *
 * Saves sent messages, allows navigating with arrow keys.
 * Saves current draft when entering history, restores on exit.
 */

import { useRef, useCallback } from 'react';

const MAX_HISTORY = 50;

interface HistoryState {
  /** Previously sent messages, newest first (index 0 = most recent). */
  entries: string[];
  /** Current navigation index: -1 means "at draft" (not navigating). */
  index: number;
  /** The text the user was composing before pressing ↑. */
  draft: string;
}

export interface InputHistoryResult {
  /** Store a sent message. Deduplicates consecutive identical entries. */
  addToHistory: (text: string) => void;
  /** Navigate up (older). Returns the text to display, or null if already at top. */
  navigateUp: (currentText: string) => string | null;
  /** Navigate down (newer). Returns the text to display, or null if already at draft. */
  navigateDown: () => string | null;
  /** Returns the current history entry text, or null if at draft position. */
  getEntry: () => string | null;
  /** True when navigating through history (index >= 0). */
  isNavigating: () => boolean;
  /** Reset to draft position without changing the input. */
  reset: () => void;
}

export function useInputHistory(): InputHistoryResult {
  const stateRef = useRef<HistoryState>({
    entries: [],
    index: -1,
    draft: '',
  });

  const addToHistory = useCallback((text: string) => {
    const s = stateRef.current;
    const trimmed = text.trim();
    if (!trimmed) return;

    // Deduplicate: don't add if same as the most recent entry
    if (s.entries.length > 0 && s.entries[0] === trimmed) {
      // Reset navigation state after send
      s.index = -1;
      s.draft = '';
      return;
    }

    s.entries.unshift(trimmed);

    // Cap at MAX_HISTORY
    if (s.entries.length > MAX_HISTORY) {
      s.entries.length = MAX_HISTORY;
    }

    // Reset navigation state after send
    s.index = -1;
    s.draft = '';
  }, []);

  const navigateUp = useCallback((currentText: string): string | null => {
    const s = stateRef.current;
    if (s.entries.length === 0) return null;

    // If at draft position, save the current text as draft
    if (s.index === -1) {
      s.draft = currentText;
    }

    const nextIndex = s.index + 1;

    // Can't go beyond the oldest entry
    if (nextIndex >= s.entries.length) return null;

    s.index = nextIndex;
    return s.entries[s.index];
  }, []);

  const navigateDown = useCallback((): string | null => {
    const s = stateRef.current;

    // Already at draft position, nothing to do
    if (s.index === -1) return null;

    const nextIndex = s.index - 1;

    if (nextIndex < 0) {
      // Return to draft
      s.index = -1;
      return s.draft;
    }

    s.index = nextIndex;
    return s.entries[s.index];
  }, []);

  const getEntry = useCallback((): string | null => {
    const s = stateRef.current;
    if (s.index < 0 || s.index >= s.entries.length) return null;
    return s.entries[s.index];
  }, []);

  const isNavigating = useCallback((): boolean => {
    return stateRef.current.index >= 0;
  }, []);

  const reset = useCallback(() => {
    stateRef.current.index = -1;
    stateRef.current.draft = '';
  }, []);

  return { addToHistory, navigateUp, navigateDown, getEntry, isNavigating, reset };
}
