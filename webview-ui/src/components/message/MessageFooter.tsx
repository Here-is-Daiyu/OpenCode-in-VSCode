/**
 * MessageFooter - Inline meta for completed assistant messages.
 */

import React, { useMemo } from 'react';
import type { AssistantMessage } from '../../types/opencode';
import { getProviderInfo, RelativeTime, toSafeDateFromEpoch } from './MessageHeader';

interface MessageFooterProps {
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
  info,
}: MessageFooterProps) {
  const modelTitle = useMemo(() => {
    const modelID = typeof info.modelID === 'string' ? info.modelID.trim() : '';
    const providerID = typeof info.providerID === 'string' ? info.providerID.trim() : '';
    return providerID && modelID
      ? `Model: ${providerID}/${modelID}`
      : modelID || providerID || undefined;
  }, [info.modelID, info.providerID]);

  const modelLabel = useMemo(() => {
    const modelID = typeof info.modelID === 'string' ? info.modelID.trim() : '';
    const providerID = typeof info.providerID === 'string' ? info.providerID.trim() : '';
    if (!modelID && !providerID) {
      return undefined;
    }

    const provider = getProviderInfo(modelID, providerID);
    return providerID && modelID ? `${provider.name} · ${modelID}` : modelID || provider.name;
  }, [info.modelID, info.providerID]);

  const messageTime = useMemo(
    () => toSafeDateFromEpoch(info.time.completed ?? info.time.created),
    [info.time.completed, info.time.created],
  );

  const messageTimeTitle = useMemo(() => {
    if (!messageTime) {
      return undefined;
    }

    return messageTime.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [messageTime]);

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

  const hasStats = duration != null || totalTokens != null || info.cost > 0;
  const hasMeta = Boolean(modelLabel) || Boolean(messageTime) || hasStats;

  if (!hasMeta) return null;

  return (
    <div className="msg-footer">
      <div className="msg-footer__meta">
        {modelLabel && (
          <span className="msg-footer__model" title={modelTitle}>
            {modelLabel}
          </span>
        )}
        {messageTime && (
          <span className="msg-footer__time" title={messageTimeTitle}>
            <RelativeTime date={messageTime} />
          </span>
        )}
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
      </div>
    </div>
  );
});
