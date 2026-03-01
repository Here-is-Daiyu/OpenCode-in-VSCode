/**
 * MessageBubble - Renders a single message (user or assistant)
 */

import React from 'react';
import type { MessageWithParts, Part, AssistantMessage, StepFinishPart } from '../types/opencode';
import { ToolCallCard } from './ToolCallCard';

interface MessageBubbleProps {
  message: MessageWithParts;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { info, parts } = message;
  const isUser = info.role === 'user';
  const timestamp = new Date(info.time.created * 1000);

  // Extract text content from parts
  const textParts = parts.filter((p) => p.type === 'text');
  const toolParts = parts.filter((p) => p.type === 'tool');
  const reasoningParts = parts.filter((p) => p.type === 'reasoning');
  const stepFinishParts = parts.filter((p): p is StepFinishPart => p.type === 'step-finish');

  // Get token usage from the last step-finish part
  const lastStepFinish = stepFinishParts.length > 0
    ? stepFinishParts[stepFinishParts.length - 1]
    : undefined;

  return (
    <div className={`message-bubble ${isUser ? 'message-bubble--user' : 'message-bubble--assistant'}`}>
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
        {/* Reasoning parts */}
        {reasoningParts.length > 0 && (
          <details className="message-bubble__reasoning">
            <summary>Thinking...</summary>
            <div className="message-bubble__reasoning-text">
              {reasoningParts.map((p) => (
                <span key={p.id}>{p.type === 'reasoning' ? p.text : ''}</span>
              ))}
            </div>
          </details>
        )}

        {/* Text parts */}
        {textParts.map((part) => (
          <div key={part.id} className="message-bubble__text">
            {renderTextContent(part)}
          </div>
        ))}

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
            {formatTokens(lastStepFinish.tokens.input)} in / {formatTokens(lastStepFinish.tokens.output)} out
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

/** Render text content - for now just plain text, markdown rendering will be enhanced later */
function renderTextContent(part: Part): React.ReactNode {
  if (part.type !== 'text') return null;
  // Simple text rendering with basic code block detection
  const text = part.text;

  // Split by code blocks for basic formatting
  const segments = text.split(/(```[\s\S]*?```)/g);
  return segments.map((segment, i) => {
    if (segment.startsWith('```') && segment.endsWith('```')) {
      // Extract language and code
      const firstNewline = segment.indexOf('\n');
      const lang = segment.slice(3, firstNewline).trim();
      const code = segment.slice(firstNewline + 1, -3);
      return (
        <pre key={i} className="message-bubble__code-block" data-lang={lang || undefined}>
          <code>{code}</code>
        </pre>
      );
    }
    // Regular text - preserve newlines
    return (
      <span key={i}>
        {segment.split('\n').map((line, j, arr) => (
          <React.Fragment key={j}>
            {line}
            {j < arr.length - 1 && <br />}
          </React.Fragment>
        ))}
      </span>
    );
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}
