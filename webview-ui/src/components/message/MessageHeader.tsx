/**
 * MessageHeader - Two-column layout with provider icon and model info.
 *
 * For user messages: 18px user icon in the decoration column, no text label.
 * For assistant messages: Provider icon + provider name (uppercase) + model name.
 * Matches the official OpenCode web UI layout.
 */

import React, { useEffect, useState } from 'react';
import type { AssistantMessage, Message } from '../../types/opencode';

interface MessageHeaderProps {
  info: Message;
}

// ---------------------------------------------------------------------------
// Provider icon detection based on model/provider ID
// ---------------------------------------------------------------------------

export function getProviderInfo(modelID: string, providerID: string): { name: string; icon: React.ReactNode } {
  const combined = `${providerID} ${modelID}`.toLowerCase();

  if (/claude|anthropic/.test(combined)) {
    return {
      name: 'ANTHROPIC',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16.5 3h-3.2L20 21h3.2L16.5 3zM.8 21h3.2l1.7-4.4h7.1L11.1 13H7.4l4.1-10.6L7.5 3 .8 21z" />
        </svg>
      ),
    };
  }

  if (/gpt|o[1-4]|codex|openai/.test(combined)) {
    return {
      name: 'OPENAI',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.28 9.37a5.93 5.93 0 0 0-.52-4.89 6.05 6.05 0 0 0-6.51-2.9A6.02 6.02 0 0 0 10.71 0a6.05 6.05 0 0 0-5.77 4.17 5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.11 5.93 5.93 0 0 0 .52 4.89 6.05 6.05 0 0 0 6.51 2.9A6.02 6.02 0 0 0 13.25 24a6.05 6.05 0 0 0 5.77-4.17 5.98 5.98 0 0 0 4-2.9 6.05 6.05 0 0 0-.74-7.56zm-9.03 13.4a4.5 4.5 0 0 1-2.89-1.05l.14-.08 4.8-2.77a.78.78 0 0 0 .39-.68v-6.76l2.03 1.17a.07.07 0 0 1 .04.06v5.6a4.52 4.52 0 0 1-4.51 4.51zm-9.69-4.14a4.49 4.49 0 0 1-.54-3.02l.14.09 4.8 2.77a.78.78 0 0 0 .78 0l5.86-3.38v2.34a.07.07 0 0 1-.03.06l-4.85 2.8a4.52 4.52 0 0 1-6.16-1.66zM2.34 7.9A4.49 4.49 0 0 1 4.7 5.92v5.7a.78.78 0 0 0 .39.68l5.86 3.38-2.03 1.17a.07.07 0 0 1-.07 0l-4.85-2.8A4.52 4.52 0 0 1 2.34 7.9zm16.63 3.87l-5.86-3.38 2.03-1.17a.07.07 0 0 1 .07 0l4.85 2.8a4.52 4.52 0 0 1-.7 8.14v-5.7a.78.78 0 0 0-.39-.69zm2.02-3.04l-.14-.09-4.8-2.77a.78.78 0 0 0-.78 0l-5.86 3.38V6.91a.07.07 0 0 1 .03-.06l4.85-2.8a4.52 4.52 0 0 1 6.7 4.68zM8.88 13.36l-2.03-1.17a.07.07 0 0 1-.04-.06V6.53a4.52 4.52 0 0 1 7.4-3.47l-.14.08-4.8 2.77a.78.78 0 0 0-.39.68v6.77zm1.1-2.37l2.61-1.51 2.61 1.51v3.01l-2.61 1.51-2.61-1.51V11z" />
        </svg>
      ),
    };
  }

  if (/gemini|palm|bard|google/.test(combined)) {
    return {
      name: 'GOOGLE',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12c2.62 0 5.05-.85 7.02-2.28l-3.38-2.62A7.16 7.16 0 0 1 12 19.2 7.19 7.19 0 0 1 4.8 12 7.19 7.19 0 0 1 12 4.8c1.87 0 3.57.72 4.85 1.89L19.67 3.87A11.94 11.94 0 0 0 12 0z" />
        </svg>
      ),
    };
  }

  if (/llama|meta/.test(combined)) {
    return {
      name: 'META',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15H8v-2h3v2zm4.5-4.5c0 .83-.67 1.5-1.5 1.5h-4c-.83 0-1.5-.67-1.5-1.5v-5C8.5 6.67 9.17 6 10 6h4c.83 0 1.5.67 1.5 1.5v5z" />
        </svg>
      ),
    };
  }

  // Fallback: sparkles icon
  return {
    name: providerID ? providerID.toUpperCase() : 'AI',
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0l1.5 4.5L14 6l-4.5 1.5L8 12l-1.5-4.5L2 6l4.5-1.5L8 0zm4 8l.75 2.25L15 11l-2.25.75L12 14l-.75-2.25L9 11l2.25-.75L12 8z" />
      </svg>
    ),
  };
}

export const MessageHeader = React.memo(function MessageHeader({
  info,
}: MessageHeaderProps) {
  const isUser = info.role === 'user';

  if (isUser) {
    // User: just the icon in the decoration column, no text
    return (
      <div className="msg-part-row msg-header-row">
        <div className="msg-part-row__decoration">
          <span className="msg-part-row__icon">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM2 13c0-3 2.5-5 6-5s6 2 6 5v1H2v-1z" />
            </svg>
          </span>
        </div>
        <div className="msg-part-row__content msg-header-row__content">
          {/* Role text hidden — kept for accessibility / screen readers */}
          <span className="msg-header__role">You</span>
        </div>
      </div>
    );
  }

  // Assistant: icon only — model/provider identity lives in the footer.
  const assistantInfo = info as AssistantMessage;
  const modelID = assistantInfo.modelID ?? '';
  const providerID = assistantInfo.providerID ?? '';
  const provider = getProviderInfo(modelID, providerID);

  return (
    <div className="msg-part-row msg-header-row">
      <div className="msg-part-row__decoration">
        <span className="msg-part-row__icon">
          {provider.icon}
        </span>
      </div>
      <div className="msg-part-row__content msg-header-row__content">
        <span className="msg-header__role">Assistant</span>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// RelativeTime (exported for potential reuse, e.g., in footer)
// ---------------------------------------------------------------------------

export function RelativeTime({ date }: { date: Date | undefined }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!date) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
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

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toSafeDateFromEpoch(created: unknown): Date | undefined {
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
