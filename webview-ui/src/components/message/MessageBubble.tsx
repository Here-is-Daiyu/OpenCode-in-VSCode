/**
 * MessageBubble - Main message wrapper component.
 *
 * Simplified orchestrator that delegates to:
 *  - MessageHeader (role icon, provider/model info)
 *  - MessageContent (part dispatcher)
 *  - MessageFooter (completed-turn meta)
 *
 * Assistant messages use a flat transparent container (no bubble).
 * Modeled on the official OpenCode web UI's conversation flow.
 *
 * Long user messages are collapsed by default (show ~3 lines) with
 * a "Show more / Show less" toggle.
 */

import React, { useMemo, useState } from 'react';
import type {
  MessageWithParts,
  AssistantMessage,
  MessageError,
} from '../../types/opencode';
import { useChatStore } from '../../stores/chatStore';
import { MessageHeader, toSafeDateFromEpoch } from './MessageHeader';
import { MessageContent } from './MessageContent';
import { MessageFooter } from './MessageFooter';
import { stripImageMarkers } from '../../utils/renderText';

/** Character threshold after which user messages are collapsible. */
const COLLAPSE_CHAR_THRESHOLD = 300;
/** Line threshold after which user messages are collapsible. */
const COLLAPSE_LINE_THRESHOLD = 4;

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
  const messages = useChatStore((s) => s.visibleMessages);
  const isLatestAssistant =
    !isUser &&
    messages.length > 0 &&
    messages[messages.length - 1].info.id === info.id;
  const showStreamingEffects = isStreaming && isLatestAssistant;
  const isLastInTurn = useMemo(() => {
    if (isUser) return false;
    const currentIndex = messages.findIndex((m) => m.info.id === info.id);
    if (currentIndex === -1) return false;
    const nextMessage = messages[currentIndex + 1];
    if (!nextMessage) return true;
    if (nextMessage.info.role !== 'assistant') return true;
    return (nextMessage.info as AssistantMessage).parentID !== (info as AssistantMessage).parentID;
  }, [messages, info, isUser]);
  const turnMeta = useMemo(() => {
    if (info.role !== 'assistant') {
      return { agentName: undefined, turnDuration: undefined };
    }

    const assistantInfo = info as AssistantMessage;
    const parentID = assistantInfo.parentID;
    const userMessage = messages.find(
      (message) => message.info.role === 'user' && message.info.id === parentID,
    );
    const assistantMessages = messages.filter(
      (message): message is MessageWithParts & { info: AssistantMessage } =>
        message.info.role === 'assistant' &&
        (message.info as AssistantMessage).parentID === parentID,
    );

    const lastCompletedAt = assistantMessages.reduce<number | undefined>((latest, message) => {
      const completedAt = message.info.time.completed;
      if (typeof completedAt !== 'number') {
        return latest;
      }
      return latest == null || completedAt > latest ? completedAt : latest;
    }, undefined);

    const createdAt = toSafeDateFromEpoch(userMessage?.info.time.created);
    const completedAt = toSafeDateFromEpoch(lastCompletedAt);
    const turnDuration =
      createdAt && completedAt
        ? Math.max(0, (completedAt.getTime() - createdAt.getTime()) / 1000)
        : undefined;

    return {
      agentName: assistantInfo.agent,
      turnDuration,
    };
  }, [messages, info]);

  // --- Collapsible user messages ---
  const isLongUserMessage = useMemo(() => {
    if (!isUser) return false;
    const hasInlineImages = parts.some(
      (part) => part.type === 'file' && (part.mime ?? part.mediaType ?? '').startsWith('image/'),
    );
    const text = parts
      .filter((p) => p.type === 'text')
      .map((p) => (p.type === 'text' ? p.text : ''))
      .join('\n');
    const displayText = hasInlineImages ? stripImageMarkers(text) : text;
    return (
      displayText.length > COLLAPSE_CHAR_THRESHOLD ||
      displayText.split('\n').length >= COLLAPSE_LINE_THRESHOLD
    );
  }, [isUser, parts]);

  const [collapsed, setCollapsed] = useState(true);

  const roleClass = isUser ? 'msg-bubble--user' : 'msg-bubble--assistant';
  const optimisticClass = isOptimistic ? 'msg-bubble--optimistic' : '';

  return (
    <div
      className={`msg-bubble ${roleClass} ${optimisticClass}`}
      data-message-id={info.id}
    >
      <MessageHeader info={info} />

      {isUser && isLongUserMessage ? (
        <>
          <div
            className={`msg-bubble__collapse-wrapper${
              collapsed ? ' msg-bubble__collapse-wrapper--collapsed' : ''
            }`}
          >
            <MessageContent
              parts={parts}
              isUser={isUser}
              isStreaming={false}
            />
          </div>
          <button
            className="msg-bubble__toggle"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-expanded={!collapsed}
            type="button"
          >
            {collapsed ? 'Show more ▸' : 'Show less ▾'}
          </button>
        </>
      ) : (
        <MessageContent
          parts={parts}
          isUser={isUser}
          isStreaming={showStreamingEffects}
        />
      )}

      {/* Queued indicator for optimistic messages */}
      {isUser && isOptimistic && (
        <div className="msg-bubble__queued-badge">Queued</div>
      )}

      {/* Error display */}
      {!isUser && (info as AssistantMessage).error && (() => {
        const err = (info as AssistantMessage).error as MessageError;
        const errMsg = err.message ?? 'Unknown error';
        return (
          <div className="msg-bubble__error">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 10.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zM8.75 4v4.5h-1.5V4h1.5z" />
            </svg>
            <span>{errMsg}</span>
          </div>
        );
      })()}

      {/* Footer for the last assistant message in a turn (non-streaming) */}
      {!isUser && !showStreamingEffects && isLastInTurn && (
        <MessageFooter
          info={info as AssistantMessage}
          agentName={turnMeta.agentName}
          turnDuration={turnMeta.turnDuration}
        />
      )}
    </div>
  );
});
