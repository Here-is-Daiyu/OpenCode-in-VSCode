/**
 * ChatInput - Auto-resizing textarea with send/stop controls and image attachments
 */

import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { useChatStore, type ChatImageAttachment } from '../stores/chatStore';
import { postMessage } from '../utils/vscodeApi';
import { ModelSelector } from './ModelSelector';
import { AgentSelector } from './AgentSelector';
import { TokenUsageBar } from './TokenUsageBar';
import { SlashCommandMenu } from './SlashCommandMenu';
import type { SlashCommandMenuHandle } from './SlashCommandMenu';
import { MentionMenu } from './MentionMenu';
import type { MentionMenuHandle } from './MentionMenu';
import { detectSlashTrigger, filterCommands } from '../utils/slashCommands';
import { useCommandStore } from '../stores/commandStore';
import { useMentionSearch } from '../hooks/useMentionSearch';
import type { MentionResult } from '../hooks/useMentionSearch';

/** Maximum file size for image attachments in bytes (10 MB) */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/** Maximum height of the chat input textarea in pixels */
const MAX_TEXTAREA_HEIGHT_PX = 200;
const BASE_TEXTAREA_HEIGHT_PX = 24;

function isImageFile(file: File) {
  return file.type.startsWith('image/');
}

function getImageMarkerLabel(index: number): string {
  return `[Image ${index}]`;
}

function getMaxImageMarkerIndex(text: string): number {
  const matches = text.matchAll(/\[Image\s+(\d+)\]/gi);
  let maxMarkerIndex = 0;

  for (const match of matches) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      maxMarkerIndex = Math.max(maxMarkerIndex, value);
    }
  }

  return maxMarkerIndex;
}

function getNextImageMarkerIndex(text: string, attachedImages: ChatImageAttachment[]): number {
  const attachmentMaxMarkerIndex = attachedImages.reduce(
    (maxMarkerIndex, image) => Math.max(maxMarkerIndex, image.markerNumber),
    0,
  );

  return Math.max(attachmentMaxMarkerIndex, getMaxImageMarkerIndex(text)) + 1;
}

function insertTextAtSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  insertText: string,
): { value: string; cursor: number } {
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  const beforeChar = before[before.length - 1];
  const afterChar = after[0];
  const needsLeadingSpace = Boolean(beforeChar) && !/[\s([{<]/.test(beforeChar);
  const needsTrailingSpace = Boolean(afterChar) && !/[\s.,!?;:)>\]}]/.test(afterChar);
  const injected = `${needsLeadingSpace ? ' ' : ''}${insertText}${needsTrailingSpace ? ' ' : ''}`;

  return {
    value: `${before}${injected}${after}`,
    cursor: before.length + injected.length,
  };
}

function insertValueAtSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  insertText: string,
): { value: string; cursor: number } {
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);

  return {
    value: `${before}${insertText}${after}`,
    cursor: before.length + insertText.length,
  };
}

function insertBlockAtSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  insertText: string,
): { value: string; cursor: number } {
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
  const suffix = after.length > 0 && !after.startsWith('\n') ? '\n' : '';

  return insertValueAtSelection(
    text,
    selectionStart,
    selectionEnd,
    `${prefix}${insertText}${suffix}`,
  );
}

function removeMarkerText(text: string, marker: string): string {
  let next = text;
  let index = next.indexOf(marker);

  while (index !== -1) {
    let start = index;
    let end = index + marker.length;
    const beforeChar = next[start - 1];
    const afterChar = next[end];

    if (beforeChar === ' ' && afterChar === ' ') {
      end += 1;
    } else if (beforeChar === ' ') {
      start -= 1;
    } else if (afterChar === ' ') {
      end += 1;
    }

    next = `${next.slice(0, start)}${next.slice(end)}`;
    index = next.indexOf(marker);
  }

  return next;
}

function createImageAttachmentID(): string {
  return `image_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type PendingImageAttachment = Omit<ChatImageAttachment, 'dataUrl'> & { file: File };

export function ChatInput() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slashMenuRef = useRef<SlashCommandMenuHandle>(null);
  const mentionMenuRef = useRef<MentionMenuHandle>(null);
  const nextImageMarkerIndexRef = useRef(1);

  const inputText = useChatStore((s) => s.inputText);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const attachedImages = useChatStore((s) => s.attachedImages);
  const pendingInputInsertions = useChatStore((s) => s.pendingInputInsertions);
  const connected = useChatStore((s) => s.connected);
  const setInputText = useChatStore((s) => s.setInputText);
  const removeImage = useChatStore((s) => s.removeImage);
  const removeImages = useChatStore((s) => s.removeImages);
  const addImage = useChatStore((s) => s.addImage);
  const consumeInputInsertion = useChatStore((s) => s.consumeInputInsertion);
  const addOptimisticMessage = useChatStore((s) => s.addOptimisticMessage);

  // Slash command state from store
  const commands = useCommandStore((s) => s.commands);
  const commandsLoading = useCommandStore((s) => s.loading);
  const initCommandListener = useCommandStore((s) => s.initListener);
  const fetchCommands = useCommandStore((s) => s.fetchCommands);

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [isTextareaExpanded, setIsTextareaExpanded] = useState(false);

  // Mention (@) state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionTriggerIndex, setMentionTriggerIndex] = useState(-1);
  const mentionSearch = useMentionSearch();

  /** Close mention menu and clear search state. */
  const closeMentionMenu = useCallback(() => {
    setMentionOpen(false);
    setMentionQuery('');
    setMentionTriggerIndex(-1);
    mentionSearch.clear();
  }, [mentionSearch]);

  // Initialize command store listener and do initial fetch
  useEffect(() => {
    const cleanup = initCommandListener();
    fetchCommands();
    return cleanup;
  }, [initCommandListener, fetchCommands]);

  // Filter commands by current query
  const filteredCommands = useMemo(
    () => filterCommands(commands, slashQuery),
    [commands, slashQuery]
  );

  const canSend = connected && (inputText.trim().length > 0 || attachedImages.length > 0);

  useEffect(() => {
    nextImageMarkerIndexRef.current = getNextImageMarkerIndex(inputText, attachedImages);
  }, [inputText, attachedImages]);

  useEffect(() => {
    const missingImageIDs = attachedImages
      .filter((image) => !inputText.includes(image.marker))
      .map((image) => image.id);

    if (missingImageIDs.length > 0) {
      removeImages(missingImageIDs);
    }
  }, [attachedImages, inputText, removeImages]);

  useEffect(() => {
    const pendingInsertion = pendingInputInsertions[0];
    if (!pendingInsertion) {
      return;
    }

    const textarea = textareaRef.current;
    const currentText = useChatStore.getState().inputText;
    const useSelection = document.activeElement === textarea;
    const selectionStart = useSelection ? textarea?.selectionStart ?? currentText.length : currentText.length;
    const selectionEnd = useSelection ? textarea?.selectionEnd ?? selectionStart : selectionStart;
    const { value, cursor } = insertBlockAtSelection(
      currentText,
      selectionStart,
      selectionEnd,
      pendingInsertion.text,
    );

    setInputText(value);
    setSlashOpen(false);
    setSlashQuery('');
    closeMentionMenu();
    consumeInputInsertion(pendingInsertion.id);

    if (pendingInsertion.focus) {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = cursor;
          textareaRef.current.selectionEnd = cursor;
        }
      }, 0);
    }
  }, [closeMentionMenu, consumeInputInsertion, pendingInputInsertions, setInputText]);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (!textarea.value) {
      textarea.style.height = `${BASE_TEXTAREA_HEIGHT_PX}px`;
      setIsTextareaExpanded(false);
      return;
    }

    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX);
    textarea.style.height = `${nextHeight}px`;
    setIsTextareaExpanded(
      textarea.scrollHeight > BASE_TEXTAREA_HEIGHT_PX + 1 || nextHeight > BASE_TEXTAREA_HEIGHT_PX + 1,
    );
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [inputText, adjustHeight]);

  const handleSend = useCallback(() => {
    if (!canSend) return;

    const text = inputText.trim();
    const images = attachedImages.length > 0
      ? attachedImages.map((image) => image.dataUrl)
      : undefined;

    // Check if this is a command execution (starts with / followed by a known command name)
    const commandMatch = text.match(/^\/(\S+)(?:\s+(.*))?$/s);
    if (commandMatch) {
      const cmdName = commandMatch[1];
      const cmdArgs = commandMatch[2]?.trim() || undefined;
      const matchedCommand = commands.find(
        (c) => c.name.toLowerCase() === cmdName.toLowerCase()
      );

      if (matchedCommand) {
        setInputText('');
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }

        if (matchedCommand.source === 'frontend') {
          switch (matchedCommand.name) {
            case 'new':
              postMessage({ type: 'session:create' });
              break;
            case 'compact':
              addOptimisticMessage('/compact');
              postMessage({ type: 'chat:send', data: { text: '/compact' } });
              break;
          }
        } else {
          postMessage({
            type: 'command:execute',
            data: { command: matchedCommand.name, args: cmdArgs },
          });
        }
        return;
      }
    }

    // Regular message send
    addOptimisticMessage(text, images);

    postMessage({
      type: 'chat:send',
      data: { text, images },
    });

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [canSend, inputText, attachedImages, commands, addOptimisticMessage, setInputText]);

  const handleStop = useCallback(() => {
    postMessage({ type: 'chat:abort' });
  }, []);

  /**
   * Detect whether the current cursor position is inside an @-mention trigger.
   * Returns the trigger info or null.
   */
  const detectMentionTrigger = useCallback(
    (text: string, cursorPos: number): { query: string; startIndex: number } | null => {
      // Walk backward from cursor to find an unescaped '@'
      for (let i = cursorPos - 1; i >= 0; i--) {
        const ch = text[i];
        // Stop if we hit whitespace or newline before finding '@'
        if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') {
          return null;
        }
        if (ch === '@') {
          // '@' must be at start of text or preceded by whitespace
          if (i > 0) {
            const prev = text[i - 1];
            if (prev !== ' ' && prev !== '\n' && prev !== '\r' && prev !== '\t') {
              return null;
            }
          }
          const query = text.slice(i + 1, cursorPos);
          return { query, startIndex: i };
        }
      }
      return null;
    },
    [],
  );

  /** Handle a file being selected from the mention menu. */
  const handleMentionSelect = useCallback(
    (result: MentionResult) => {
      const textarea = textareaRef.current;
      if (!textarea || mentionTriggerIndex < 0) {
        closeMentionMenu();
        return;
      }

      // Replace `@query` with `@filename `
      const before = inputText.slice(0, mentionTriggerIndex);
      const cursorPos = textarea.selectionStart ?? inputText.length;
      const after = inputText.slice(cursorPos);
      const insertText = `@${result.name} `;
      const newText = before + insertText + after;
      const newCursorPos = before.length + insertText.length;

      setInputText(newText);
      closeMentionMenu();

      // Restore focus and set cursor position after React re-render
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = newCursorPos;
          textareaRef.current.selectionEnd = newCursorPos;
        }
      }, 0);
    },
    [inputText, mentionTriggerIndex, setInputText, closeMentionMenu],
  );

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

      // When mention menu is open, intercept navigation keys
      if (mentionOpen && mentionSearch.results.length > 0) {
        switch (e.key) {
          case 'ArrowUp':
            e.preventDefault();
            mentionMenuRef.current?.moveUp();
            return;
          case 'ArrowDown':
            e.preventDefault();
            mentionMenuRef.current?.moveDown();
            return;
          case 'Tab':
          case 'Enter':
            e.preventDefault();
            mentionMenuRef.current?.selectCurrent();
            return;
          case 'Escape':
            e.preventDefault();
            closeMentionMenu();
            return;
        }
      } else if (mentionOpen) {
        // Menu is open but no results — still intercept Escape
        if (e.key === 'Escape') {
          e.preventDefault();
          closeMentionMenu();
          return;
        }
      }

      // Enter to send, Shift+Enter for newline
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [slashOpen, filteredCommands.length, mentionOpen, mentionSearch.results.length, closeMentionMenu, handleSend]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart ?? value.length;
      setInputText(value);

      // Detect slash trigger
      const trigger = detectSlashTrigger(value, cursorPos);
      if (trigger) {
        if (!slashOpen) {
          // Trigger fetch when menu first opens (respects TTL internally)
          fetchCommands();
        }
        setSlashOpen(true);
        setSlashQuery(trigger.query);
        // Close mention menu if slash is active
        if (mentionOpen) closeMentionMenu();
      } else {
        setSlashOpen(false);
        setSlashQuery('');
      }

      // Detect mention trigger (only when slash menu is not active)
      if (!trigger) {
        const mention = detectMentionTrigger(value, cursorPos);
        if (mention) {
          setMentionOpen(true);
          setMentionQuery(mention.query);
          setMentionTriggerIndex(mention.startIndex);
          mentionSearch.search(mention.query);
        } else if (mentionOpen) {
          closeMentionMenu();
        }
      }
    },
    [setInputText, slashOpen, fetchCommands, mentionOpen, closeMentionMenu, detectMentionTrigger, mentionSearch]
  );

  const handleSlashSelect = useCallback(
    (command: { name: string; description?: string; source: 'frontend' | 'api' }) => {
      setSlashOpen(false);
      setSlashQuery('');

      if (command.source === 'frontend') {
        // Frontend commands execute immediately
        setInputText('');
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.focus();
        }

        switch (command.name) {
          case 'new':
            postMessage({ type: 'session:create' });
            break;
          case 'compact':
            addOptimisticMessage('/compact');
            postMessage({ type: 'chat:send', data: { text: '/compact' } });
            break;
        }
      } else {
        // API commands: set input to "/commandName " so user can add arguments
        const newText = `/${command.name} `;
        setInputText(newText);
        if (textareaRef.current) {
          textareaRef.current.focus();
          // Use setTimeout(0) to ensure React has committed the DOM update
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = newText.length;
              textareaRef.current.selectionEnd = newText.length;
            }
          }, 0);
        }
      }
    },
    [setInputText, addOptimisticMessage]
  );

  const handleSlashClose = useCallback(() => {
    setSlashOpen(false);
    setSlashQuery('');
  }, []);

  const collectValidImageFiles = useCallback((files: Iterable<File>): File[] => {
    return Array.from(files).filter((file) => {
      if (!isImageFile(file)) {
        return false;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        console.warn(`Image too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 10MB)`);
        return false;
      }

      return true;
    });
  }, []);

  const readImageFile = useCallback((file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };

      reader.onerror = () => {
        console.error('Failed to read image file');
        resolve(null);
      };

      reader.readAsDataURL(file);
    });
  }, []);

  const processAcceptedImageFiles = useCallback(
    async (images: PendingImageAttachment[]) => {
      if (images.length === 0) {
        return;
      }

      const resolvedImages = await Promise.all(images.map(async (image) => {
        const dataUrl = await readImageFile(image.file);
        if (!dataUrl) {
          return null;
        }

        const { file: _file, ...attachment } = image;
        return {
          ...attachment,
          dataUrl,
        } satisfies ChatImageAttachment;
      }));

      resolvedImages.forEach((image) => {
        if (image && useChatStore.getState().inputText.includes(image.marker)) {
          addImage(image);
        }
      });
    },
    [addImage, readImageFile]
  );

  const insertAcceptedImages = useCallback(
    (files: File[], mode: 'selection' | 'append') => {
      if (files.length === 0) {
        return;
      }

      const currentText = useChatStore.getState().inputText;
      const startIndex = nextImageMarkerIndexRef.current;
      const images = files.map((file, offset) => {
        const markerNumber = startIndex + offset;
        return {
          id: createImageAttachmentID(),
          marker: getImageMarkerLabel(markerNumber),
          markerNumber,
          file,
        } satisfies PendingImageAttachment;
      });
      const markerText = images.map((image) => image.marker).join(' ');
      const textarea = textareaRef.current;
      const useSelection = mode === 'selection' && document.activeElement === textarea;
      const selectionStart = useSelection ? textarea?.selectionStart ?? currentText.length : currentText.length;
      const selectionEnd = useSelection ? textarea?.selectionEnd ?? selectionStart : selectionStart;
      const { value, cursor } = insertTextAtSelection(
        currentText,
        selectionStart,
        selectionEnd,
        markerText,
      );

      nextImageMarkerIndexRef.current = startIndex + images.length;
      setInputText(value);
      setSlashOpen(false);
      setSlashQuery('');
      closeMentionMenu();

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = cursor;
          textareaRef.current.selectionEnd = cursor;
        }
      }, 0);

      void processAcceptedImageFiles(images);
    },
    [closeMentionMenu, processAcceptedImageFiles, setInputText]
  );

  const handleImageRemove = useCallback(
    (image: ChatImageAttachment) => {
      removeImage(image.id);

      const currentText = useChatStore.getState().inputText;
      const nextText = removeMarkerText(currentText, image.marker);
      if (nextText !== currentText) {
        setInputText(nextText);
        setSlashOpen(false);
        setSlashQuery('');
        closeMentionMenu();
      }
    },
    [closeMentionMenu, removeImage, setInputText]
  );

  // Drag and drop support
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = collectValidImageFiles(e.dataTransfer.files);
      insertAcceptedImages(files, 'append');
    },
    [collectValidImageFiles, insertAcceptedImages]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const imageFiles = collectValidImageFiles(
        Array.from(e.clipboardData.items)
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null)
      );

      if (imageFiles.length === 0) {
        return;
      }

      e.preventDefault();

      insertAcceptedImages(imageFiles, 'selection');
    },
    [collectValidImageFiles, insertAcceptedImages]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div className="chat-input" onDrop={handleDrop} onDragOver={handleDragOver}>
      <div className="chat-input__inner">
        <div className="chat-input__dock">
          <SlashCommandMenu
            ref={slashMenuRef}
            commands={filteredCommands}
            visible={slashOpen}
            loading={commandsLoading}
            query={slashQuery}
            onSelect={handleSlashSelect}
            onClose={handleSlashClose}
          />
          <MentionMenu
            ref={mentionMenuRef}
            results={mentionSearch.results}
            visible={mentionOpen}
            loading={mentionSearch.loading}
            query={mentionQuery}
            onSelect={handleMentionSelect}
            onClose={closeMentionMenu}
          />
          <div className="chat-input__shell">
            <div className="chat-input__row">
              <div className="chat-input__field">
                <textarea
                  ref={textareaRef}
                  className={`chat-input__textarea${isTextareaExpanded ? ' chat-input__textarea--expanded' : ''}`}
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
            <div className="chat-input__meta">
              <div className="chat-input__toolbar">
                <div className="chat-input__selectors">
                  <ModelSelector />
                  <AgentSelector />
                </div>
              </div>

              <TokenUsageBar />
            </div>
          </div>

          {attachedImages.length > 0 && (
            <div className="chat-input__tray">
                <div className="chat-input__images">
                {attachedImages.map((image) => (
                  <div key={image.id} className="chat-input__image-preview" title={image.marker}>
                    <img src={image.dataUrl} alt={`Attachment ${image.marker}`} />
                    <button
                      className="chat-input__image-remove"
                      onClick={() => handleImageRemove(image)}
                      title={`Remove ${image.marker}`}
                      aria-label={`Remove attachment ${image.marker}`}
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
      </div>
    </div>
  );
}
