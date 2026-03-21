/**
 * Slash command state management using Zustand
 *
 * Stores the merged list of frontend + API slash commands with
 * TTL-based caching and request deduplication to avoid redundant
 * round-trips to the extension host.
 */

import { create } from 'zustand';
import { FRONTEND_COMMANDS, type SlashCommand } from '../utils/slashCommands';
import { postMessage } from '../utils/vscodeApi';

/** How long (ms) a successful fetch result is considered fresh. */
const CACHE_TTL = 10_000;

/** Safety timeout (ms) to reset fetching state if extension never responds. */
const FETCH_TIMEOUT = 10_000;

/**
 * Monotonically increasing fetch generation counter.
 * Each new fetch increments the counter; the safety timeout only fires
 * if its generation still matches the current one, preventing stale
 * timeouts from colliding with newer fetch requests.
 */
let fetchGeneration = 0;

export interface CommandState {
  /** All available commands (frontend + API), already merged */
  commands: SlashCommand[];
  /** Whether we're currently loading API commands (initial load) */
  loading: boolean;
  /** Timestamp of last successful fetch */
  lastFetchTime: number;
  /** Whether a fetch request is currently in-flight */
  fetching: boolean;
  /** Whether the last fetch attempt failed */
  lastFetchFailed: boolean;

  /** Set API commands from extension host response */
  setApiCommands: (commands: Array<{ name: string; description?: string }>) => void;
  /** Request commands from extension host (with TTL check + dedup) */
  fetchCommands: () => void;
  /** Force re-fetch (ignoring TTL) */
  invalidateCache: () => void;
  /** Initialize the message listener. Returns cleanup function. */
  initListener: () => () => void;
}

export const useCommandStore = create<CommandState>((set, get) => ({
  commands: [...FRONTEND_COMMANDS],
  loading: true,
  lastFetchTime: 0,
  fetching: false,
  lastFetchFailed: false,

  setApiCommands: (apiCommands) => {
    const apiSlashCommands: SlashCommand[] = apiCommands.map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
      source: 'api' as const,
    }));

    // Merge: frontend commands first, then API commands (skip duplicates by name)
    const frontendNames = new Set(FRONTEND_COMMANDS.map((c) => c.name));
    const deduped = apiSlashCommands.filter((c) => !frontendNames.has(c.name));

    set({
      commands: [...FRONTEND_COMMANDS, ...deduped],
      lastFetchTime: Date.now(),
      fetching: false,
      loading: false,
      lastFetchFailed: false,
    });
  },

  fetchCommands: () => {
    const { lastFetchTime, fetching, lastFetchFailed } = get();

    // Skip if already fetching (dedup)
    if (fetching) return;

    // Skip if cache is still fresh AND last fetch didn't fail
    if (!lastFetchFailed && Date.now() - lastFetchTime < CACHE_TTL) return;

    set({ fetching: true });
    postMessage({ type: 'command:list' });

    // Safety: reset fetching if extension never responds
    const gen = ++fetchGeneration;
    setTimeout(() => {
      // Only act if this is still the current generation
      if (gen === fetchGeneration && get().fetching) {
        set({ fetching: false, lastFetchFailed: true });
      }
    }, FETCH_TIMEOUT);
  },

  invalidateCache: () => {
    set({ lastFetchTime: 0, lastFetchFailed: false });
    // Always post the message — let the extension handle dedup if needed
    set({ fetching: true });
    postMessage({ type: 'command:list' });

    const gen = ++fetchGeneration;
    setTimeout(() => {
      if (gen === fetchGeneration && get().fetching) {
        set({ fetching: false, lastFetchFailed: true });
      }
    }, FETCH_TIMEOUT);
  },

  initListener: () => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type === 'command:listed' && Array.isArray(message.data?.commands)) {
        get().setApiCommands(message.data.commands);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  },
}));
