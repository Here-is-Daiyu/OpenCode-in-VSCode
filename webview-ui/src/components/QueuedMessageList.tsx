import React from 'react';
import type { QueuedChatMessage } from '../stores/messageQueueStore';

const QUEUE_DRAG_DATA_TYPE = 'application/x-opencode-queued-message-index';

interface QueuedMessageListProps {
  items: QueuedChatMessage[];
  sendingMessageID?: string;
  failedMessageID?: string;
  onRecall: (messageID: string) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
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
  onReorder,
}: QueuedMessageListProps) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dropTarget, setDropTarget] = React.useState<number | null>(null);

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
          const draggable = Boolean(onReorder) && !sending && !failed;
          const statusText = sending ? 'Sending…' : failed ? 'Failed' : index === 0 ? 'Next' : 'Queued';
          const meta = getMetaText(item);

          return (
            <div
              key={item.id}
              className={[
                'chat-queue__item',
                dragIndex === index ? 'chat-queue__item--dragging' : '',
                dropTarget === index ? 'chat-queue__item--drop-target' : '',
              ].filter(Boolean).join(' ')}
              data-sending={sending || undefined}
              data-failed={failed || undefined}
              draggable={draggable}
              onDragStart={(event) => {
                if (!draggable) {
                  return;
                }

                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData(QUEUE_DRAG_DATA_TYPE, String(index));
                event.dataTransfer.setData('text/plain', String(index));
                setDragIndex(index);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDropTarget(null);
              }}
              onDragOver={(event) => {
                if (!onReorder || !event.dataTransfer.types.includes(QUEUE_DRAG_DATA_TYPE)) {
                  return;
                }

                event.preventDefault();
                setDropTarget(index);
              }}
              onDragLeave={(event) => {
                const relatedTarget = event.relatedTarget;
                if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
                  setDropTarget(null);
                }
              }}
              onDrop={(event) => {
                if (!onReorder || !event.dataTransfer.types.includes(QUEUE_DRAG_DATA_TYPE)) {
                  return;
                }

                event.preventDefault();

                const fromIndex = Number(event.dataTransfer.getData(QUEUE_DRAG_DATA_TYPE));
                if (Number.isFinite(fromIndex)) {
                  onReorder(fromIndex, index);
                }

                setDragIndex(null);
                setDropTarget(null);
              }}
            >
              <span className="chat-queue__drag-handle" aria-hidden="true">
                ⠿
              </span>
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
