/**
 * MessageHeader - Role icon, model badge, and relative timestamp.
 */

import React, { useEffect, useState } from 'react';
import type { AssistantMessage, Message } from '../../types/opencode';

interface MessageHeaderProps {
  info: Message;
}

export const MessageHeader = React.memo(function MessageHeader({
  info,
}: MessageHeaderProps) {
  const isUser = info.role === 'user';
  const timestamp = toSafeDateFromEpoch(info.time?.created);

  return (
    <div className="msg-header">
      <span className="msg-header__icon">
        {isUser ? (
          // Person icon (codicon-like)
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM2 13c0-3 2.5-5 6-5s6 2 6 5v1H2v-1z" />
          </svg>
        ) : (
          // Hubot icon (codicon-like)
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5 3a2 2 0 0 0-2 2v2h2V5h6v2h2V5a2 2 0 0 0-2-2H5zm8 6H3v2a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9zM6 10h1v1H6v-1zm3 0h1v1H9v-1z" />
          </svg>
        )}
      </span>
      <span className="msg-header__role">{isUser ? 'You' : 'Assistant'}</span>
      {!isUser && (info as AssistantMessage).modelID && (
        <span className="msg-header__model">{(info as AssistantMessage).modelID}</span>
      )}
      <span className="msg-header__time">
        <RelativeTime date={timestamp} />
      </span>
    </div>
  );
});

// ---------------------------------------------------------------------------
// RelativeTime - updates the displayed time periodically
// ---------------------------------------------------------------------------

function RelativeTime({ date }: { date: Date | undefined }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!date) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000); // update every 30s
    return () => clearInterval(id);
  }, [date]);

  return <>{formatRelativeTime(date)}</>;
}

function formatRelativeTime(date: Date | undefined): string {
  if (!date) return '';

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  // Absolute for older messages
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toSafeDateFromEpoch(created: unknown): Date | undefined {
  const n =
    typeof created === 'number'
      ? created
      : typeof created === 'string'
        ? Number(created)
        : NaN;

  if (!Number.isFinite(n)) return undefined;

  const ms = n >= 1e11 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
