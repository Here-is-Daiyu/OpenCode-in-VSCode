/**
 * MessageFooter - Stats (duration, tokens, cost) and copy action for
 * completed assistant messages.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { AssistantMessage, Part } from '../../types/opencode';
import { toSafeDateFromEpoch } from './MessageHeader';

interface MessageFooterProps {
  parts: Part[];
  info: AssistantMessage;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a duration in seconds to a human-readable string. */
function formatDuration(seconds: number): string {
  if (seconds < 1) return '< 1s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

/** Format a cost value as $X.XXXX. */
function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

export const MessageFooter = React.memo(function MessageFooter({
  parts,
  info,
}: MessageFooterProps) {
  const [copied, setCopied] = useState(false);
  const textContent = useMemo(
    () => parts
      .filter((p) => p.type === 'text')
      .map((p) => (p.type === 'text' ? p.text : ''))
      .join('\n\n')
      .trim(),
    [parts],
  );

  // --- Turn duration ---
  const duration = useMemo(() => {
    const created = toSafeDateFromEpoch(info.time.created);
    const completed = info.time.completed
      ? toSafeDateFromEpoch(info.time.completed)
      : undefined;
    if (!created || !completed) return undefined;
    const diffMs = completed.getTime() - created.getTime();
    return diffMs > 0 ? diffMs / 1000 : undefined;
  }, [info.time.created, info.time.completed]);

  // --- Token count ---
  const totalTokens = useMemo(() => {
    if (info.tokens.total != null && info.tokens.total > 0) {
      return info.tokens.total;
    }
    // Fallback: sum individual token fields
    const sum =
      info.tokens.input +
      info.tokens.output +
      info.tokens.reasoning +
      info.tokens.cache.read +
      info.tokens.cache.write;
    return sum > 0 ? sum : undefined;
  }, [info.tokens]);

  // Copy handler: copies all text content from parts
  const handleCopy = useCallback(() => {
    if (textContent) {
      navigator.clipboard.writeText(textContent).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [textContent]);

  const hasStats = duration != null || totalTokens != null || info.cost > 0;

  if (!textContent && !hasStats) return null;

  return (
    <div className="msg-footer">
      {/* Stats — left side */}
      {hasStats && (
        <div className="msg-footer__stats">
          {duration != null && (
            <span className="msg-footer__stat" title="Turn duration">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5A5.5 5.5 0 1 1 8 2.5a5.5 5.5 0 0 1 0 11zM8.5 4H7v5l4.28 2.54.75-1.23L8.5 8.31V4z" />
              </svg>
              {formatDuration(duration)}
            </span>
          )}
          {totalTokens != null && (
            <span className="msg-footer__stat" title="Total tokens">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M5.5 3l-4 9h1.5l1-2.25h4L9 12h1.5l-4-9h-1zm-.75 5.25L6 5.25l1.25 3H4.75zM11 3v9h1.5V3H11z" />
              </svg>
              {totalTokens.toLocaleString()}
            </span>
          )}
          {info.cost > 0 && (
            <span className="msg-footer__stat" title="Cost">
              {formatCost(info.cost)}
            </span>
          )}
        </div>
      )}

      {/* Copy button — right side */}
      {textContent && (
        <button
          className="msg-footer__copy"
          onClick={handleCopy}
          title="Copy message text"
          type="button"
        >
          {copied ? (
            <>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.27 10.87l-2.6-2.6L2.54 9.4l3.73 3.73 8.2-8.2-1.13-1.13z" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 4h1V2H2v3h2V4zm0 8H2v-3h2v1h1v2H4zm8-8h-1V2h3v3h-2V4zm0 8h2v-3h-2v1h-1v2h1zM6 2h4v1H6V2zm0 11h4v1H6v-1zM2 6h1v4H2V6zm11 0h1v4h-1V6z" />
              </svg>
              Copy
            </>
          )}
        </button>
      )}
    </div>
  );
});
