/**
 * Slash command utilities for the chat input.
 * Handles detection, parsing, and filtering of slash commands.
 */

/** A slash command that can be triggered from the chat input. */
export interface SlashCommand {
  /** Command name without the leading `/` */
  name: string;
  /** Human-readable description shown in the autocomplete menu */
  description?: string;
  /** Optional keyboard shortcut hint (display only) */
  keybind?: string;
  /** Where the command is defined — frontend commands run locally */
  source: 'frontend' | 'api';
}

/** Commands that are always available and executed locally in the webview. */
export const FRONTEND_COMMANDS: SlashCommand[] = [
  { name: 'new', description: 'Start a new session', source: 'frontend' },
  { name: 'compact', description: 'Compact message history', source: 'frontend' },
];

/** Result returned by {@link detectSlashTrigger} when a trigger is found. */
export interface SlashTrigger {
  /** The partial command text after `/`, used for filtering */
  query: string;
  /** Character index where the `/` starts (always 0) */
  startIndex: number;
}

/**
 * Detect whether the current input text represents an active slash command trigger.
 *
 * A trigger is recognized only when:
 * - The text starts with `/` at position 0
 * - The query portion (text between `/` and cursor) contains no spaces or newlines
 *
 * @param text - The full input text
 * @param cursorPosition - The current cursor offset within the text
 * @returns The trigger info, or `null` if no valid trigger is detected
 *
 * @example
 * detectSlashTrigger('/com', 4)   // → { query: 'com', startIndex: 0 }
 * detectSlashTrigger('/new session', 12) // → null (space in query)
 * detectSlashTrigger('hello /cmd', 10)   // → null (/ not at start)
 */
export function detectSlashTrigger(
  text: string,
  cursorPosition: number,
): SlashTrigger | null {
  if (text.length === 0 || text[0] !== '/') {
    return null;
  }

  const query = text.slice(1, cursorPosition);

  if (/[\s]/.test(query)) {
    return null;
  }

  return { query, startIndex: 0 };
}

/**
 * Filter a list of slash commands by a partial query string.
 *
 * Matching is case-insensitive and checks whether the command name
 * starts with the given query. An empty query returns all commands.
 *
 * @param commands - The full list of available commands
 * @param query - The partial name to match against (without leading `/`)
 * @returns Commands whose name starts with the lowercased query
 */
export function filterCommands(
  commands: SlashCommand[],
  query: string,
): SlashCommand[] {
  if (query === '') {
    return commands;
  }

  const lowerQuery = query.toLowerCase();
  return commands.filter((cmd) => cmd.name.toLowerCase().startsWith(lowerQuery));
}
