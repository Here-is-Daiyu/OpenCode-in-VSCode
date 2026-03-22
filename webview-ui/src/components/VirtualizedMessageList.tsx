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

const getFallbackMessageId = (message: MessageWithParts | undefined, index: number): string => {
  const role = message?.info?.role ?? 'unknown';
  const createdAt = message?.info?.time?.created ?? 'unknown';
  const partsCount = message?.parts?.length ?? 0;
  const firstPartType = message?.parts?.[0]?.type ?? 'none';

  return `message-fallback-${role}-${createdAt}-${partsCount}-${firstPartType}-${index}`;
};

const getMessageItemId = (message: MessageWithParts | undefined, index: number): string =>
  message?.info?.id || getFallbackMessageId(message, index);

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
    getItemKey: (index) => getMessageItemId(messages[index], index),
    estimateSize: (index) => {
      const msg = messages[index];
      // User messages are typically shorter
      if (msg?.info?.role === 'user') return 100;
      // Assistant messages vary greatly — estimate based on parts count
      const partsCount = msg?.parts?.length ?? 1;
      return Math.min(800, 120 + partsCount * 80);
    },
    overscan: 10,
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
        if (!msg?.info) {
          return null;
        }

        const messageId = getMessageItemId(msg, virtualItem.index);
        const safeMessage = msg.info.id === messageId
          ? msg
          : { ...msg, info: { ...msg.info, id: messageId } };

        return (
          <div
            key={virtualItem.key}
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
            <MessageErrorBoundary messageId={messageId} message={safeMessage}>
              <MessageBubble message={safeMessage} />
            </MessageErrorBoundary>
          </div>
        );
      })}
    </div>
  );
};
