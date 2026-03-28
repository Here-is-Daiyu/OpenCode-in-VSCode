import React, { useMemo } from 'react';
import type { MessageWithParts } from '../types/opencode';

interface LastApiResponsePanelProps {
  message?: MessageWithParts;
}

function formatJson(value: unknown): string {
  try {
    if (value == null) {
      return '{}';
    }

    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value ?? '{}');
  }
}

export function LastApiResponsePanel({ message }: LastApiResponsePanelProps) {
  const content = useMemo(() => {
    if (!message) {
      return undefined;
    }

    return formatJson(message);
  }, [message]);

  return (
    <aside className="last-api-response" aria-label="Last API response">
      <div className="last-api-response__header">
        <div className="last-api-response__title">Last API Response</div>
        <div className="last-api-response__subtitle">
          Latest visible assistant message in this session
        </div>
        {message && (
          <div className="last-api-response__meta">
            assistant · {message.info.id}
          </div>
        )}
      </div>

      {content ? (
        <pre className="last-api-response__body">
          <code>{content}</code>
        </pre>
      ) : (
        <div className="last-api-response__empty">No API response yet</div>
      )}
    </aside>
  );
}
