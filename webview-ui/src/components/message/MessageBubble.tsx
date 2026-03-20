/**
 * MessageBubble - Main message wrapper component.
 *
 * Simplified orchestrator that delegates to:
 *  - MessageHeader (role icon, provider/model info)
 *  - MessageContent (part dispatcher)
 *  - MessageFooter (minimal copy affordance)
 *
 * Assistant messages use a flat transparent container (no bubble).
 * Modeled on the official OpenCode web UI's conversation flow.
 */

import React from 'react';
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

  const roleClass = isUser ? 'msg-bubble--user' : 'msg-bubble--assistant';
  const optimisticClass = isOptimistic ? 'msg-bubble--optimistic' : '';

  return (
    <div
      className={`msg-bubble ${roleClass} ${optimisticClass}`}
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
        <MessageFooter parts={parts} />
      )}
    </div>
  );
});
