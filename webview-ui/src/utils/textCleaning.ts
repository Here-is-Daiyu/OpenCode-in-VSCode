/**
 * Text cleaning utilities for reasoning traces.
 *
 * Collapses excessive whitespace and normalises the content for cleaner display.
 */

/** Repeated newlines beyond two. */
const EXCESSIVE_NEWLINES = /\n{3,}/g;

/** Multiple consecutive spaces (not newlines). */
const EXCESSIVE_SPACES = /[ \t]{2,}/g;

/** Trailing whitespace on each line. */
const TRAILING_WS = /[ \t]+$/gm;

/**
 * Clean reasoning text for display:
 * 1. Trim outer whitespace
 * 2. Collapse excessive blank lines (max 2 newlines)
 * 3. Collapse excessive inline spaces
 * 4. Strip trailing whitespace per line
 */
export function cleanReasoningText(raw: string): string {
  if (!raw) return '';

  return raw
    .trim()
    .replace(EXCESSIVE_NEWLINES, '\n\n')
    .replace(EXCESSIVE_SPACES, ' ')
    .replace(TRAILING_WS, '')
    .trim();
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * - < 1s:  "123ms"
 * - < 10s: "2.3s"
 * - ≥ 10s: "12s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}
