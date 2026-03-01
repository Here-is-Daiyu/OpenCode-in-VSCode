/**
 * TextPart - Renders text content via MarkdownRenderer.
 */

import React from 'react';
import { MarkdownRenderer } from '../../MarkdownRenderer';

interface TextPartProps {
  text: string;
  className?: string;
}

export const TextPart = React.memo(function TextPart({ text, className }: TextPartProps) {
  if (!text) return null;

  return (
    <div className={`msg-text ${className ?? ''}`}>
      <MarkdownRenderer content={text} />
    </div>
  );
});
