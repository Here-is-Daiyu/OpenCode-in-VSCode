/**
 * ChatInput - Auto-resizing textarea with send/stop controls and image attachments
 */

import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { useChatStore } from '../stores/chatStore';
import { postMessage } from '../utils/vscodeApi';
import { ModelSelector } from './ModelSelector';
import { AgentSelector } from './AgentSelector';
import { TokenUsageBar } from './TokenUsageBar';
import { SlashCommandMenu } from './SlashCommandMenu';
import type { SlashCommandMenuHandle } from './SlashCommandMenu';
import { FRONTEND_COMMANDS, detectSlashTrigger, filterCommands } from '../utils/slashCommands';
import type { SlashCommand } from '../utils/slashCommands';

/** Maximum file size for image attachments in bytes (10 MB) */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/** Maximum height of the chat input textarea in pixels */
const MAX_TEXTAREA_HEIGHT_PX = 200;

function isImageFile(file: File) {
  return file.type.startsWith('image/');
}

export function ChatInput() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slashMenuRef = useRef<SlashCommandMenuHandle>(null);

  const inputText = useChatStore((s) => s.inputText);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const attachedImages = useChatStore((s) => s.attachedImages);
  const connected = useChatStore((s) => s.connected);
  const setInputText = useChatStore((s) => s.setInputText);
  const removeImage = useChatStore((s) => s.removeImage);
  const addImage = useChatStore((s) => s.addImage);
  const addOptimisticMessage = useChatStore((s) => s.addOptimisticMessage);

  // Slash command state
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [apiCommands, setApiCommands] = useState<SlashCommand[]>([]);

  // Fetch API commands from extension host
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'command:listed' && Array.isArray(msg.data?.commands)) {
        setApiCommands(
          msg.data.commands.map((cmd: { name: string; description?: string }) => ({
            name: cmd.name,
            description: cmd.description,
            source: 'api' as const,
          }))
        );
      }
    };

    window.addEventListener('message', handleMessage);
    // Request commands from extension
    postMessage({ type: 'command:list' });

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Merge frontend + API commands, then filter by current query
  const allCommands = useMemo(
    () => [...FRONTEND_COMMANDS, ...apiCommands],
    [apiCommands]
  );

  const filteredCommands = useMemo(
    () => filterCommands(allCommands, slashQuery),
    [allCommands, slashQuery]
  );

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
      // When slash menu is open, intercept navigation keys
      if (slashOpen && filteredCommands.length > 0) {
        switch (e.key) {
          case 'ArrowUp':
            e.preventDefault();
            slashMenuRef.current?.moveUp();
            return;
          case 'ArrowDown':
            e.preventDefault();
            slashMenuRef.current?.moveDown();
            return;
          case 'Tab':
          case 'Enter':
            e.preventDefault();
            slashMenuRef.current?.selectCurrent();
            return;
          case 'Escape':
            e.preventDefault();
            setSlashOpen(false);
            setSlashQuery('');
            return;
        }
      }

      // Enter to send, Shift+Enter for newline
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [slashOpen, filteredCommands.length, handleSend]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart ?? value.length;
      setInputText(value);

      // Detect slash trigger
      const trigger = detectSlashTrigger(value, cursorPos);
      if (trigger) {
        setSlashOpen(true);
        setSlashQuery(trigger.query);
      } else {
        setSlashOpen(false);
        setSlashQuery('');
      }
    },
    [setInputText]
  );

  const handleSlashSelect = useCallback(
    (command: SlashCommand) => {
      setSlashOpen(false);
      setSlashQuery('');
      setInputText('');

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.focus();
      }

      if (command.source === 'frontend') {
        // Handle frontend commands locally
        switch (command.name) {
          case 'new':
            postMessage({ type: 'session:create' });
            break;
          case 'compact':
            // Send /compact as a regular message to be processed by the server
            addOptimisticMessage('/compact');
            postMessage({ type: 'chat:send', data: { text: '/compact' } });
            break;
        }
      } else {
        // API command: send via command:execute
        postMessage({
          type: 'command:execute',
          data: { command: command.name },
        });
      }
    },
    [setInputText, addOptimisticMessage]
  );

  const processImageFile = useCallback(
    (file: File) => {
      if (!isImageFile(file)) return;
      if (file.size > MAX_IMAGE_SIZE) {
        console.warn(`Image too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 10MB)`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          console.error('Unexpected image reader result type');
          return;
        }
        addImage(reader.result);
      };
      reader.onerror = () => {
        console.error('Failed to read image file');
      };
      reader.readAsDataURL(file);
    },
    [addImage]
  );

  const processImageFiles = useCallback(
    (files: Iterable<File>) => {
      Array.from(files).forEach(processImageFile);
    },
    [processImageFile]
  );

  // Image attachment via file input
  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      processImageFiles(files);

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [processImageFiles]
  );

  // Drag and drop support
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer.files;
      processImageFiles(files);
    },
    [processImageFiles]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const imageFiles = Array.from(e.clipboardData.items)
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      if (imageFiles.length === 0) {
        return;
      }

      e.preventDefault();
      processImageFiles(imageFiles);
    },
    [processImageFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div className="chat-input" onDrop={handleDrop} onDragOver={handleDragOver}>
      <div className="chat-input__inner">
        <div className="chat-input__dock">
          <ModelSelector />
          <SlashCommandMenu
            ref={slashMenuRef}
            commands={filteredCommands}
            visible={slashOpen}
            onSelect={handleSlashSelect}
          />
          <div className="chat-input__shell">
            <div className="chat-input__row">
              <button
                className="chat-input__attach-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Attach image"
                aria-label="Attach image"
                disabled={isStreaming}
                type="button"
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

              <div className="chat-input__field">
                <textarea
                  ref={textareaRef}
                  className="chat-input__textarea"
                  value={inputText}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={
                    connected
                      ? 'Type your message... (@ for files, / for commands)'
                      : 'Connecting to OpenCode...'
                  }
                  disabled={!connected}
                  rows={1}
                />
              </div>

              <div className="chat-input__actions">
                {isStreaming && (
                  <button
                    className="chat-input__stop-btn"
                    onClick={handleStop}
                    title="Stop generation"
                    aria-label="Stop generation"
                    type="button"
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
                  aria-label="Send message"
                  type="button"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1 1.5l14 6.5-14 6.5V9l8-1-8-1V1.5z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {attachedImages.length > 0 && (
            <div className="chat-input__tray">
              <div className="chat-input__images">
                {attachedImages.map((img, index) => (
                  <div key={index} className="chat-input__image-preview">
                    <img src={img} alt={`Attachment ${index + 1}`} />
                    <button
                      className="chat-input__image-remove"
                      onClick={() => removeImage(index)}
                      title="Remove image"
                      aria-label={`Remove attachment ${index + 1}`}
                      type="button"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="chat-input__toolbar">
          <AgentSelector />
        </div>

        <div className="chat-input__hint">
          <span>Enter to send · Shift+Enter for new line</span>
        </div>
        <TokenUsageBar />
      </div>
    </div>
  );
}
