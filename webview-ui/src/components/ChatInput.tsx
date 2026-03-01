/**
 * ChatInput - Auto-resizing textarea with send/stop controls and image attachments
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import { postMessage } from '../utils/vscodeApi';

/** Maximum file size for image attachments in bytes (10 MB) */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/** Maximum height of the chat input textarea in pixels */
const MAX_TEXTAREA_HEIGHT_PX = 200;

export function ChatInput() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inputText = useChatStore((s) => s.inputText);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const attachedImages = useChatStore((s) => s.attachedImages);
  const connected = useChatStore((s) => s.connected);
  const setInputText = useChatStore((s) => s.setInputText);
  const removeImage = useChatStore((s) => s.removeImage);
  const addImage = useChatStore((s) => s.addImage);
  const addOptimisticMessage = useChatStore((s) => s.addOptimisticMessage);

  const canSend = connected && inputText.trim().length > 0;

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [inputText, adjustHeight]);

  const handleSend = useCallback(() => {
    if (!canSend) return;

    const text = inputText.trim();
    const images = attachedImages.length > 0 ? [...attachedImages] : undefined;

    // Optimistic update: add message to store immediately, clear input
    addOptimisticMessage(text, images);

    // Fire-and-forget: send to extension host
    postMessage({
      type: 'chat:send',
      data: { text, images },
    });

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [canSend, inputText, attachedImages, addOptimisticMessage]);

  const handleStop = useCallback(() => {
    postMessage({ type: 'chat:abort' });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter to send, Shift+Enter for newline
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputText(e.target.value);
    },
    [setInputText]
  );

  // Image attachment via file input
  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      Array.from(files).forEach((file) => {
        if (!file.type.startsWith('image/')) return;
        if (file.size > MAX_IMAGE_SIZE) {
          console.warn(`Image too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 10MB)`);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          addImage(base64);
        };
        reader.onerror = () => {
          console.error('Failed to read image file');
        };
        reader.readAsDataURL(file);
      });

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [addImage]
  );

  // Drag and drop support
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer.files;
      Array.from(files).forEach((file) => {
        if (!file.type.startsWith('image/')) return;
        if (file.size > MAX_IMAGE_SIZE) {
          console.warn(`Image too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 10MB)`);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          addImage(base64);
        };
        reader.onerror = () => {
          console.error('Failed to read image file');
        };
        reader.readAsDataURL(file);
      });
    },
    [addImage]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div className="chat-input" onDrop={handleDrop} onDragOver={handleDragOver}>
      {/* Image attachment preview */}
      {attachedImages.length > 0 && (
        <div className="chat-input__images">
          {attachedImages.map((img, index) => (
            <div key={index} className="chat-input__image-preview">
              <img src={img} alt={`Attachment ${index + 1}`} />
              <button
                className="chat-input__image-remove"
                onClick={() => removeImage(index)}
                title="Remove image"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="chat-input__row">
        {/* Image attach button */}
        <button
          className="chat-input__attach-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Attach image"
          disabled={isStreaming}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.5 1a3.5 3.5 0 0 1 .19 6.995l-.19.005H5a2 2 0 0 1-.15-3.995L5 4h5.5a.5.5 0 0 1 .09.992L10.5 5H5a1 1 0 0 0-.117 1.993L5 7h6.5a2.5 2.5 0 0 0 .164-4.995L11.5 2H5a3.5 3.5 0 0 0-.192 6.995L5 9h6.5a.5.5 0 0 1 .09.992L11.5 10H5a4.5 4.5 0 0 1-.212-8.995L5 1h6.5z" />
          </svg>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleImageSelect}
        />

        <textarea
          ref={textareaRef}
          className="chat-input__textarea"
          value={inputText}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            connected
              ? 'Type your message... (@ for files, / for commands)'
              : 'Connecting to OpenCode...'
          }
          disabled={!connected}
          rows={1}
        />

        {/* Action buttons */}
        <div className="chat-input__actions">
          {isStreaming && (
            <button
              className="chat-input__stop-btn"
              onClick={handleStop}
              title="Stop generation"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="3" width="10" height="10" rx="1" />
              </svg>
            </button>
          )}
          <button
            className="chat-input__send-btn"
            onClick={handleSend}
            disabled={!canSend}
            title="Send message (Enter)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 1.5l14 6.5-14 6.5V9l8-1-8-1V1.5z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="chat-input__hint">
        <span>Enter to send, Shift+Enter for new line</span>
      </div>
    </div>
  );
}
