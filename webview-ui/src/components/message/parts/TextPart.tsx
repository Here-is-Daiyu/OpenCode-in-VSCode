/**
 * TextPart - Renders text content via MarkdownRenderer.
 */

import React from 'react';
import { MarkdownRenderer } from '../../MarkdownRenderer';
import { useThrottledValue } from '../../../hooks/useThrottledValue';

interface TextPartProps {
  text: string;
  className?: string;
  cacheKey?: string;
  isStreaming?: boolean;
}

export const TextPart = React.memo(function TextPart({
  text,
  className,
  cacheKey,
  isStreaming,
}: TextPartProps) {
  const raw = typeof text === 'string' ? text : '';
  const value = raw.trim();
  const throttled = useThrottledValue(value, undefined, !!isStreaming);

  if (!raw || !throttled) return null;

  return (
    <div className={`msg-text ${className ?? ''}`}>
      <MarkdownRenderer content={throttled} cacheKey={cacheKey} />
    </div>
  );
});
