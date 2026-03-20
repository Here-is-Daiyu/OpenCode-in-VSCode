/**
 * ReasoningPart - Expandable thinking section with smooth CSS animation.
 * Replaces the crude <details> tag with a proper collapsible panel.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { MarkdownRenderer } from '../../MarkdownRenderer';
import { useThrottledValue } from '../../../hooks/useThrottledValue';

interface ReasoningPartProps {
  text: string;
  isStreaming?: boolean;
  cacheKey?: string;
}

export const ReasoningPart = React.memo(function ReasoningPart({
  text,
  isStreaming,
  cacheKey,
}: ReasoningPartProps) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const value = typeof text === 'string' ? text.trim() : '';
  const throttled = useThrottledValue(value, undefined, !!isStreaming);

  useEffect(() => {
    if (contentRef.current) {
      setMeasuredHeight(contentRef.current.scrollHeight);
    }
  }, [expanded, throttled]);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  if (!throttled && !isStreaming) return null;

  return (
    <div className={`msg-reasoning ${expanded ? 'msg-reasoning--expanded' : ''}`}>
      <button
        className="msg-reasoning__header"
        onClick={toggle}
        aria-expanded={expanded}
        type="button"
        >
          <span className="msg-reasoning__icon">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" opacity="0.7">
              <path d="M8 1C4.13 1 1 3.58 1 6.75c0 1.83 1.12 3.46 2.86 4.48l-.7 2.52L6.04 12.2c.63.18 1.29.3 1.96.3 3.87 0 7-2.58 7-5.75S11.87 1 8 1z" />
            </svg>
          </span>
          <span className="msg-reasoning__title">
          THINKING
          </span>
        {isStreaming && (
          <span className="msg-reasoning__shimmer">
            <span className="text-shimmer">...</span>
          </span>
        )}
        <span className={`msg-reasoning__chevron ${expanded ? 'msg-reasoning__chevron--open' : ''}`}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 4l4 4-4 4" />
          </svg>
        </span>
      </button>

      <div
        className="msg-reasoning__collapse"
        style={{
          maxHeight: expanded ? `${Math.min(measuredHeight + 32, 400)}px` : '0px',
        }}
      >
        <div ref={contentRef} className="msg-reasoning__content">
          {throttled ? (
            <MarkdownRenderer
              content={throttled}
              className="msg-reasoning__markdown"
              cacheKey={cacheKey}
            />
          ) : isStreaming ? (
            <span className="msg-reasoning__placeholder text-shimmer">Thinking...</span>
          ) : null}
        </div>
      </div>
    </div>
  );
});
