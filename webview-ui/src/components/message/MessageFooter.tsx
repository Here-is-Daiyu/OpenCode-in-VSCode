/**
 * MessageFooter - Token usage, cost, and copy action for assistant messages.
 */

import React, { useCallback, useState } from 'react';
import type { StepFinishPart, Part, AssistantMessage } from '../../types/opencode';

interface MessageFooterProps {
  info: AssistantMessage;
  parts: Part[];
}

export const MessageFooter = React.memo(function MessageFooter({
  info,
  parts,
}: MessageFooterProps) {
  const [copied, setCopied] = useState(false);

  // Aggregate token counts from the message's own info (preferred) or step-finish parts
  const tokens = info.tokens;
  const cost = info.cost ?? 0;
  const hasTokens = tokens && typeof tokens.input === 'number' && typeof tokens.output === 'number' && (tokens.input > 0 || tokens.output > 0);

  // Copy handler: copies all text content from parts
  const handleCopy = useCallback(() => {
    const textContent = parts
      .filter((p) => p.type === 'text')
      .map((p) => (p.type === 'text' ? p.text : ''))
      .join('\n\n');

    if (textContent) {
      navigator.clipboard.writeText(textContent).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [parts]);

  if (!hasTokens && cost <= 0) return null;

  return (
    <div className="msg-footer">
      {hasTokens && (
        <span className="msg-footer__tokens">
          {formatTokens(tokens.input)} in / {formatTokens(tokens.output)} out
          {(tokens?.reasoning ?? 0) > 0 && ` / ${formatTokens(tokens.reasoning)} reasoning`}
        </span>
      )}
      {cost > 0 && <span className="msg-footer__cost">${cost.toFixed(4)}</span>}
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
    </div>
  );
});

function formatTokens(count: number | undefined): string {
  if (count == null) return '0';
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}
