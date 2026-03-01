/**
 * MessageBubble - Renders a single message (user or assistant)
 */

import React from 'react';
import type { MessageWithParts, Part, AssistantMessage, StepFinishPart } from '../types/opencode';
import { ToolCallCard } from './ToolCallCard';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useChatStore } from '../stores/chatStore';

interface MessageBubbleProps {
  message: MessageWithParts;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { info, parts } = message;
  const isUser = info.role === 'user';
  const timestamp = toSafeDateFromEpoch(info.time?.created);

  const optimisticMessageID = useChatStore((s) => s.optimisticMessageID);
  const isOptimistic = info.id === optimisticMessageID;

  // Extract content from parts by type
  const textParts = parts.filter((p) => p.type === 'text');
  const toolParts = parts.filter((p) => p.type === 'tool');
  const reasoningParts = parts.filter((p) => p.type === 'reasoning');
  const stepFinishParts = parts.filter((p): p is StepFinishPart => p.type === 'step-finish');

  // Get token usage from the last step-finish part
  const lastStepFinish = stepFinishParts.length > 0
    ? stepFinishParts[stepFinishParts.length - 1]
    : undefined;

  // Combine all text parts into a single string for markdown rendering
  const textContent = textParts
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join('\n\n');

  // Combine reasoning text
  const reasoningContent = reasoningParts
    .map((p) => (p.type === 'reasoning' ? p.text : ''))
    .join('');

  return (
    <div className={`message-bubble ${isUser ? 'message-bubble--user' : 'message-bubble--assistant'}${isOptimistic ? ' message-bubble--optimistic' : ''}`}>
      <div className="message-bubble__header">
        <span className="message-bubble__role-icon">
          {isUser ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM2 13c0-3 2.5-5 6-5s6 2 6 5v1H2v-1z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5 3a2 2 0 0 0-2 2v2h2V5h6v2h2V5a2 2 0 0 0-2-2H5zm8 6H3v2a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9zM6 10h1v1H6v-1zm3 0h1v1H9v-1z" />
            </svg>
          )}
        </span>
        <span className="message-bubble__role">
          {isUser ? 'You' : 'Assistant'}
        </span>
        {!isUser && (info as AssistantMessage).modelID && (
          <span className="message-bubble__model">
            {(info as AssistantMessage).modelID}
          </span>
        )}
        <span className="message-bubble__time">
          {formatTime(timestamp)}
        </span>
      </div>

      <div className="message-bubble__content">
        {/* Reasoning parts (collapsible) */}
        {reasoningContent && (
          <details className="message-bubble__reasoning">
            <summary>Thinking...</summary>
            <div className="message-bubble__reasoning-text">
              <MarkdownRenderer content={reasoningContent} />
            </div>
          </details>
        )}

        {/* Text content rendered as Markdown */}
        {textContent && (
          <div className="message-bubble__text">
            <MarkdownRenderer content={textContent} />
          </div>
        )}

        {/* Tool call parts */}
        {toolParts.map((part) => (
          part.type === 'tool' ? (
            <ToolCallCard key={part.id} part={part} />
          ) : null
        ))}

        {/* Error display */}
        {!isUser && (info as AssistantMessage).error && (
          <div className="message-bubble__error">
            <span className="message-bubble__error-icon">&#x26A0;</span>
            {(info as AssistantMessage).error!.message}
          </div>
        )}
      </div>

      {/* Token usage footer for assistant messages */}
      {!isUser && lastStepFinish && (
        <div className="message-bubble__footer">
          <span className="message-bubble__tokens">
            {formatTokens(lastStepFinish.tokens?.input ?? 0)} in / {formatTokens(lastStepFinish.tokens?.output ?? 0)} out
          </span>
          {lastStepFinish.cost > 0 && (
            <span className="message-bubble__cost">
              ${lastStepFinish.cost.toFixed(4)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function toSafeDateFromEpoch(created: unknown): Date | undefined {
  // OpenCode server uses epoch milliseconds; some client-side optimistic messages use seconds.
  const n = typeof created === 'number'
    ? created
    : typeof created === 'string'
      ? Number(created)
      : NaN;

  if (!Number.isFinite(n)) return undefined;

  const ms = n >= 1e11 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function formatTime(date: Date | undefined): string {
  if (!date) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}
