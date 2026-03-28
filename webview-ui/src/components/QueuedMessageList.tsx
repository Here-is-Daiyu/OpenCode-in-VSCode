import React from 'react';
import type { QueuedChatMessage } from '../stores/messageQueueStore';

interface QueuedMessageListProps {
  items: QueuedChatMessage[];
  sendingMessageID?: string;
  failedMessageID?: string;
  onRecall: (messageID: string) => void;
}

function getPreviewText(item: QueuedChatMessage): string {
  const line = item.text
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean);

  if (line) {
    return line;
  }

  if (item.images.length === 1) {
    return '[1 image attachment]';
  }

  if (item.images.length > 1) {
    return `[${item.images.length} image attachments]`;
  }

  return '[Queued follow-up]';
}

function getMetaText(item: QueuedChatMessage): string | undefined {
  if (item.images.length === 0) {
    return undefined;
  }

  return item.images.length === 1 ? '1 image attached' : `${item.images.length} images attached`;
}

export function QueuedMessageList({
  items,
  sendingMessageID,
  failedMessageID,
  onRecall,
}: QueuedMessageListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="chat-queue" role="status" aria-live="polite">
      <div className="chat-queue__header">
        <span className="chat-queue__badge">Queue</span>
        <span className="chat-queue__title">
          {items.length === 1 ? '1 follow-up queued' : `${items.length} follow-ups queued`}
        </span>
      </div>

      {failedMessageID && (
        <div className="chat-queue__note">
          A queued send failed. Edit the failed item to resume automatic sending.
        </div>
      )}

      <div className="chat-queue__list">
        {items.map((item, index) => {
          const sending = item.id === sendingMessageID;
          const failed = item.id === failedMessageID;
          const statusText = sending ? 'Sending…' : failed ? 'Failed' : index === 0 ? 'Next' : 'Queued';
          const meta = getMetaText(item);

          return (
            <div
              key={item.id}
              className="chat-queue__item"
              data-sending={sending || undefined}
              data-failed={failed || undefined}
            >
              <div className="chat-queue__body">
                <div className="chat-queue__item-header">
                  <span className="chat-queue__item-badge">{statusText}</span>
                  <span className="chat-queue__preview">{getPreviewText(item)}</span>
                </div>
                {meta && <div className="chat-queue__meta">{meta}</div>}
              </div>

              <button
                className="chat-queue__action"
                onClick={() => onRecall(item.id)}
                disabled={sending}
                type="button"
              >
                {sending ? 'Sending…' : 'Edit'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
