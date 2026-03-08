/**
 * MessageBubble - Main message wrapper component.
 *
 * Simplified orchestrator that delegates to:
 *  - MessageHeader (role, model, timestamp)
 *  - MessageContent (part dispatcher)
 *  - MessageFooter (tokens, cost, copy)
 *
 * Modeled on OpenCode Desktop's SessionTurn approach.
 */

import React, { useCallback, useState } from 'react';
import type {
  MessageWithParts,
  AssistantMessage,
} from '../../types/opencode';
import { useChatStore } from '../../stores/chatStore';
import { MessageHeader } from './MessageHeader';
import { MessageContent } from './MessageContent';
import { MessageFooter } from './MessageFooter';

interface MessageBubbleProps {
  message: MessageWithParts;
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
}: MessageBubbleProps) {
  const { info, parts } = message;
  const isUser = info.role === 'user';
  const [hovered, setHovered] = useState(false);

  const optimisticMessageID = useChatStore((s) => s.optimisticMessageID);
  const isOptimistic = info.id === optimisticMessageID;
  const isStreaming = useChatStore((s) => s.isStreaming);

  // Determine if this is the latest assistant message (for streaming indicator)
  const messages = useChatStore((s) => s.messages);
  const isLatestAssistant =
    !isUser &&
    messages.length > 0 &&
    messages[messages.length - 1].info.id === info.id;
  const showStreamingEffects = isStreaming && isLatestAssistant;

  // Copy full text on hover-click
  const handleCopyAll = useCallback(() => {
    const textContent = (parts ?? [])
      .filter((p) => p.type === 'text')
      .map((p) => (p.type === 'text' ? p.text : ''))
      .join('\n\n');
    if (textContent) {
      navigator.clipboard.writeText(textContent);
    }
  }, [parts]);

  const roleClass = isUser ? 'msg-bubble--user' : 'msg-bubble--assistant';
  const optimisticClass = isOptimistic ? 'msg-bubble--optimistic' : '';

  return (
    <div
      className={`msg-bubble ${roleClass} ${optimisticClass}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <MessageHeader info={info} />

      <MessageContent
        parts={parts}
        isUser={isUser}
        isStreaming={showStreamingEffects}
      />

      {/* Error display */}
      {!isUser && (info as AssistantMessage).error && (() => {
        const err = (info as AssistantMessage).error;
        const errMsg = typeof err === 'string' ? err : (err as any)?.message ?? 'Unknown error';
        return (
          <div className="msg-bubble__error">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 10.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zM8.75 4v4.5h-1.5V4h1.5z" />
            </svg>
            <span>{errMsg}</span>
          </div>
        );
      })()}

      {/* Footer for completed assistant messages */}
      {!isUser && !showStreamingEffects && (
        <MessageFooter info={info as AssistantMessage} parts={parts} />
      )}

      {/* Hover copy button for user messages */}
      {isUser && hovered && (
        <button
          className="msg-bubble__hover-copy"
          onClick={handleCopyAll}
          title="Copy message"
          type="button"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 4h1V2H2v3h2V4zm0 8H2v-3h2v1h1v2H4zm8-8h-1V2h3v3h-2V4zm0 8h2v-3h-2v1h-1v2h1zM6 2h4v1H6V2zm0 11h4v1H6v-1zM2 6h1v4H2V6zm11 0h1v4h-1V6z" />
          </svg>
        </button>
      )}
    </div>
  );
});
