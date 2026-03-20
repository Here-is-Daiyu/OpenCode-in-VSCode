/**
 * VirtualizedMessageList - Renders messages using @tanstack/react-virtual
 * for efficient scrolling with large message counts (>= 40).
 *
 * Uses dynamic measurement so every message is measured after render,
 * allowing variable-height content (code blocks, tool output, etc.)
 * without layout issues.
 */

import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { MessageWithParts } from '../types/opencode';
import { MessageBubble } from './message/MessageBubble';
import { MessageErrorBoundary } from './ErrorBoundary';

interface VirtualizedMessageListProps {
  messages: MessageWithParts[];
  scrollElementRef: React.RefObject<HTMLDivElement | null>;
}

export const VirtualizedMessageList: React.FC<VirtualizedMessageListProps> = ({
  messages,
  scrollElementRef,
}) => {
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: (index) => {
      const msg = messages[index];
      // User messages are typically shorter
      if (msg?.info?.role === 'user') return 100;
      // Assistant messages vary greatly — estimate based on parts count
      const partsCount = msg?.parts?.length ?? 1;
      return Math.min(800, 120 + partsCount * 80);
    },
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      className="chat-messages__virtual"
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        width: '100%',
        position: 'relative',
      }}
    >
      {virtualItems.map((virtualItem) => {
        const msg = messages[virtualItem.index];
        return (
          <div
            key={msg.info.id}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <MessageErrorBoundary messageId={msg.info.id} message={msg}>
              <MessageBubble message={msg} />
            </MessageErrorBoundary>
          </div>
        );
      })}
    </div>
  );
};
