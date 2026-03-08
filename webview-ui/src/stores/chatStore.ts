/**
 * Chat state management using Zustand
 */

import { create } from 'zustand';
import type {
  Session,
  SessionStatus as OpenCodeSessionStatus,
  MessageWithParts,
  Part,
  FilePart,
  PermissionRequest,
  Question,
  TextPart,
} from '../types/opencode';

export type ChatSessionStatus = OpenCodeSessionStatus['status'];

type ChatSessionStatusInput = ChatSessionStatus | 'busy' | undefined;

type BufferedRealtimeParts = Record<string, Part[]>;

const DEFAULT_OPTIMISTIC_IMAGE_MIME = 'image/png';
const DATA_URL_MIME_PATTERN = /^data:([^;,]+)(?:;[^,]*)?,/i;

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' || first === '\'') && last === first) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function extractMimeFromDataUrl(value: string): string | undefined {
  const mime = DATA_URL_MIME_PATTERN.exec(value)?.[1]?.trim().toLowerCase();
  return mime || undefined;
}

function extensionForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/svg+xml':
      return 'svg';
    case 'image/x-icon':
    case 'image/vnd.microsoft.icon':
      return 'ico';
    default: {
      const subtype = mime.split('/')[1];
      return subtype ? subtype.split('+')[0].toLowerCase() : 'bin';
    }
  }
}

function createOptimisticImagePart(
  messageID: string,
  image: string,
  index: number,
): FilePart | undefined {
  const normalizedImage = stripWrappingQuotes(image);
  if (!normalizedImage) {
    return undefined;
  }

  const mime = extractMimeFromDataUrl(normalizedImage) ?? DEFAULT_OPTIMISTIC_IMAGE_MIME;
  const url = normalizedImage.startsWith('data:')
    ? normalizedImage
    : `data:${mime};base64,${normalizedImage.replace(/\s+/g, '')}`;

  return {
    type: 'file',
    id: `${messageID}_file_${index + 1}`,
    mime,
    filename: `image-${index + 1}.${extensionForMime(mime)}`,
    url,
  } satisfies FilePart;
}

function createOptimisticMessageParts(
  messageID: string,
  text: string,
  images?: string[],
): Part[] {
  const parts: Part[] = [];
  const normalizedText = text.trim();

  if (normalizedText) {
    parts.push({
      type: 'text',
      id: `${messageID}_text`,
      text: normalizedText,
    } satisfies TextPart);
  }

  if (images?.length) {
    for (const [index, image] of images.entries()) {
      const imagePart = createOptimisticImagePart(messageID, image, index);
      if (imagePart) {
        parts.push(imagePart);
      }
    }
  }

  return parts;
}

function appendStringField(existing: unknown, delta: string): string {
  return `${typeof existing === 'string' ? existing : ''}${delta}`;
}

function applyDeltaToExistingPart(part: Part, field: string | undefined, delta: string): Part {
  if (!delta) {
    return part;
  }

  if (!field || field === 'text' || field === 'reasoning_content' || field === 'reasoning_details') {
    if (part.type === 'text' || part.type === 'reasoning') {
      return {
        ...part,
        text: `${part.text}${delta}`,
      };
    }

    return part;
  }

  if (part.type === 'tool') {
    switch (field) {
      case 'output':
      case 'state.output':
        return {
          ...part,
          state: {
            ...part.state,
            output: appendStringField(part.state.output, delta),
          },
        };
      case 'error':
      case 'state.error':
        return {
          ...part,
          state: {
            ...part.state,
            error: appendStringField(part.state.error, delta),
          },
        };
      case 'title':
      case 'state.title':
        return {
          ...part,
          state: {
            ...part.state,
            title: appendStringField(part.state.title, delta),
          },
        };
      default:
        return part;
    }
  }

  return part;
}

function createBufferedPartFromDelta(
  messageID: string,
  partID: string,
  delta: string,
  field?: string,
  sessionID?: string,
): Part | undefined {
  if (!delta) {
    return undefined;
  }

  if (!field || field === 'text') {
    return {
      type: 'text',
      id: partID,
      text: delta,
      sessionID,
      messageID,
    } satisfies TextPart;
  }

  if (field === 'reasoning_content' || field === 'reasoning_details') {
    return {
      type: 'reasoning',
      id: partID,
      text: delta,
    };
  }

  return undefined;
}

function upsertPart(parts: Part[], part: Part): Part[] {
  const partIndex = parts.findIndex((existingPart) => existingPart.id === part.id);
  if (partIndex === -1) {
    return [...parts, part];
  }

  const updatedParts = [...parts];
  updatedParts[partIndex] = part;
  return updatedParts;
}

function mergeBufferedPartsIntoMessage(
  message: MessageWithParts,
  bufferedParts?: Part[],
): MessageWithParts {
  if (!bufferedParts?.length) {
    return message;
  }

  let mergedParts = getMessageParts(message);
  for (const bufferedPart of bufferedParts) {
    mergedParts = upsertPart(mergedParts, bufferedPart);
  }

  return {
    ...message,
    parts: mergedParts,
  };
}

function applyPartDelta(
  parts: Part[],
  messageID: string,
  partID: string,
  delta: string,
  field?: string,
  sessionID?: string,
): Part[] {
  if (!delta) {
    return parts;
  }

  const partIndex = parts.findIndex((part) => part.id === partID);
  if (partIndex !== -1) {
    const updatedParts = [...parts];
    updatedParts[partIndex] = applyDeltaToExistingPart(updatedParts[partIndex], field, delta);
    return updatedParts;
  }

  const bufferedPart = createBufferedPartFromDelta(messageID, partID, delta, field, sessionID);
  if (!bufferedPart) {
    return parts;
  }

  return [...parts, bufferedPart];
}

function omitBufferedParts(
  bufferedParts: BufferedRealtimeParts,
  messageID: string,
): BufferedRealtimeParts {
  if (!(messageID in bufferedParts)) {
    return bufferedParts;
  }

  const { [messageID]: _removed, ...remaining } = bufferedParts;
  return remaining;
}

function normalizeSessionStatus(status: string | undefined): ChatSessionStatus {
  switch (status) {
    case 'busy':
      return 'active';
    case 'idle':
    case 'active':
    case 'error':
    case 'compacting':
    case 'retry':
      return status;
    default:
      return 'idle';
  }
}

function normalizeMessageParts(
  message: MessageWithParts,
  existingParts?: Part[]
): MessageWithParts {
  const incomingParts = Array.isArray(message.parts) ? message.parts : undefined;
  const shouldPreserveExistingParts =
    Array.isArray(existingParts) && existingParts.length > 0 && (!incomingParts || incomingParts.length === 0);

  return {
    ...message,
    parts: shouldPreserveExistingParts
      ? existingParts
      : incomingParts ?? existingParts ?? [],
  };
}

function getMessageParts(message: MessageWithParts): Part[] {
  return Array.isArray(message.parts) ? message.parts : [];
}

export interface ChatState {
  // Connection
  connected: boolean;
  version?: string;

  // Session
  currentSession?: Session;
  messages: MessageWithParts[];
  sessionStatus: ChatSessionStatus;

  // UI
  inputText: string;
  isStreaming: boolean;
  attachedImages: string[];

  // Optimistic message tracking for rollback
  optimisticMessageID?: string;
  savedInputText?: string;
  bufferedRealtimeParts: BufferedRealtimeParts;

  // Prompts
  pendingPermission?: PermissionRequest;
  pendingQuestion?: Question;

  // Actions
  setConnected: (connected: boolean, version?: string) => void;
  setSession: (session: Session, messages: MessageWithParts[]) => void;
  updateSession: (session: Session) => void;
  clearSession: () => void;
  setSessionStatus: (status: ChatSessionStatusInput) => void;
  prependMessages: (messages: MessageWithParts[]) => number;
  addMessage: (message: MessageWithParts) => void;
  updateMessage: (message: MessageWithParts) => void;
  updatePart: (messageID: string, part: Part) => void;
  appendPartDelta: (
    messageID: string,
    partID: string,
    delta: string,
    field?: string,
    sessionID?: string,
  ) => void;
  removeMessage: (messageID: string) => void;
  setInputText: (text: string) => void;
  setStreaming: (streaming: boolean) => void;
  addImage: (base64: string) => void;
  removeImage: (index: number) => void;
  clearImages: () => void;
  setPermission: (permission?: PermissionRequest) => void;
  setQuestion: (question?: Question) => void;
  addOptimisticMessage: (text: string, images?: string[]) => string;
  rollbackOptimisticMessage: () => void;
  confirmOptimisticMessage: () => void;
  clear: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  connected: false,
  version: undefined,
  currentSession: undefined,
  messages: [],
  sessionStatus: 'idle',
  inputText: '',
  isStreaming: false,
  attachedImages: [],
  optimisticMessageID: undefined,
  savedInputText: undefined,
  bufferedRealtimeParts: {},
  pendingPermission: undefined,
  pendingQuestion: undefined,

  // Actions
  setConnected: (connected, version) => set({ connected, version }),

  setSession: (session, messages) =>
    set({
      currentSession: session,
      messages: messages.map((message) => {
        const normalizedMessage = normalizeMessageParts(message);
        return mergeBufferedPartsIntoMessage(
          normalizedMessage,
          get().bufferedRealtimeParts[normalizedMessage.info.id],
        );
      }),
      sessionStatus: 'idle',
      isStreaming: false,
      bufferedRealtimeParts: {},
      pendingPermission: undefined,
      pendingQuestion: undefined,
    }),

  updateSession: (session) =>
    set((state) => ({
      currentSession: state.currentSession?.id === session.id ? session : state.currentSession,
    })),

  clearSession: () =>
    set({
      currentSession: undefined,
      messages: [],
      sessionStatus: 'idle',
      isStreaming: false,
      bufferedRealtimeParts: {},
      pendingPermission: undefined,
      pendingQuestion: undefined,
      optimisticMessageID: undefined,
      savedInputText: undefined,
    }),

  setSessionStatus: (status) => {
    const normalizedStatus = normalizeSessionStatus(status);

    set({ sessionStatus: normalizedStatus });
    if (normalizedStatus === 'idle') {
      set({ isStreaming: false });
    } else if (normalizedStatus === 'active') {
      set({ isStreaming: true });
    }
    // 'retry' keeps isStreaming as-is (server is retrying)
  },

  prependMessages: (messages) => {
    let prependedCount = 0;

    set((state) => {
      if (messages.length === 0) {
        return state;
      }

      const incomingMessageIDs = new Set(messages.map((message) => message.info.id));
      const nextBufferedRealtimeParts = { ...state.bufferedRealtimeParts };
      const normalizedMessages = messages.map((message) => {
        const normalizedMessage = normalizeMessageParts(message);
        const mergedMessage = mergeBufferedPartsIntoMessage(
          normalizedMessage,
          nextBufferedRealtimeParts[normalizedMessage.info.id],
        );
        delete nextBufferedRealtimeParts[normalizedMessage.info.id];
        return mergedMessage;
      });

      const existingIds = new Set(state.messages.map((message) => message.info.id));
      const seenIncomingIds = new Set<string>();
      const uniqueMessages = normalizedMessages.filter((message) => {
        const messageId = message.info.id;
        if (existingIds.has(messageId) || seenIncomingIds.has(messageId)) {
          return false;
        }

        seenIncomingIds.add(messageId);
        return true;
      });

      if (uniqueMessages.length === 0) {
        return state;
      }

      prependedCount = uniqueMessages.length;
      return {
        messages: [...uniqueMessages, ...state.messages],
        bufferedRealtimeParts:
          incomingMessageIDs.size > 0 ? nextBufferedRealtimeParts : state.bufferedRealtimeParts,
      };
    });

    return prependedCount;
  },

  addMessage: (message) =>
    set((state) => {
      const mergedMessage = mergeBufferedPartsIntoMessage(
        normalizeMessageParts(message),
        state.bufferedRealtimeParts[message.info.id],
      );
      const nextBufferedRealtimeParts = omitBufferedParts(state.bufferedRealtimeParts, message.info.id);

      // Don't add duplicate messages
      const existingMessage = state.messages.find((m) => m.info.id === mergedMessage.info.id);
      const exists = Boolean(existingMessage);
      if (exists) {
        // Update instead
        return {
          messages: state.messages.map((m) =>
            m.info.id === mergedMessage.info.id
              ? normalizeMessageParts(mergedMessage, existingMessage?.parts)
              : m
          ),
          bufferedRealtimeParts: nextBufferedRealtimeParts,
        };
      }
      return {
        messages: [...state.messages, mergedMessage],
        bufferedRealtimeParts: nextBufferedRealtimeParts,
      };
    }),

  updateMessage: (message) =>
    set((state) => {
      const index = state.messages.findIndex((m) => m.info.id === message.info.id);
      const existingMessage = index === -1 ? undefined : state.messages[index];
      const normalizedMessage = mergeBufferedPartsIntoMessage(
        normalizeMessageParts(message, existingMessage?.parts),
        state.bufferedRealtimeParts[message.info.id],
      );
      const nextBufferedRealtimeParts = omitBufferedParts(state.bufferedRealtimeParts, message.info.id);

      if (index === -1) {
        // Message not found, add it
        return {
          messages: [...state.messages, normalizedMessage],
          bufferedRealtimeParts: nextBufferedRealtimeParts,
        };
      }
      const updated = [...state.messages];
      updated[index] = normalizedMessage;
      return {
        messages: updated,
        bufferedRealtimeParts: nextBufferedRealtimeParts,
      };
    }),

  updatePart: (messageID, part) => {
    set((state) => {
      const msgIndex = state.messages.findIndex((m) => m.info.id === messageID);
      if (msgIndex === -1) {
        return {
          bufferedRealtimeParts: {
            ...state.bufferedRealtimeParts,
            [messageID]: upsertPart(state.bufferedRealtimeParts[messageID] ?? [], part),
          },
        };
      }

      const msg = state.messages[msgIndex];
      const newParts = upsertPart(getMessageParts(msg), part);

      const updated = [...state.messages];
      updated[msgIndex] = { ...msg, parts: newParts };
      return { messages: updated };
    });
  },

  appendPartDelta: (messageID, partID, delta, field, sessionID) =>
    set((state) => {
      if (!delta) {
        return state;
      }

      const msgIndex = state.messages.findIndex((m) => m.info.id === messageID);
      if (msgIndex === -1) {
        return {
          bufferedRealtimeParts: {
            ...state.bufferedRealtimeParts,
            [messageID]: applyPartDelta(
              state.bufferedRealtimeParts[messageID] ?? [],
              messageID,
              partID,
              delta,
              field,
              sessionID,
            ),
          },
        };
      }

      const msg = state.messages[msgIndex];
      const newParts = applyPartDelta(
        getMessageParts(msg),
        messageID,
        partID,
        delta,
        field,
        sessionID ?? msg.info.sessionID,
      );

      const updated = [...state.messages];
      updated[msgIndex] = { ...msg, parts: newParts };
      return { messages: updated };
    }),

  removeMessage: (messageID) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.info.id !== messageID),
      bufferedRealtimeParts: omitBufferedParts(state.bufferedRealtimeParts, messageID),
    })),

  setInputText: (text) => set({ inputText: text }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  addImage: (base64) =>
    set((state) => ({
      attachedImages: [...state.attachedImages, base64],
    })),

  removeImage: (index) =>
    set((state) => ({
      attachedImages: state.attachedImages.filter((_, i) => i !== index),
    })),

  clearImages: () => set({ attachedImages: [] }),

  setPermission: (permission) => set({ pendingPermission: permission }),

  setQuestion: (question) => set({ pendingQuestion: question }),

  addOptimisticMessage: (text, images) => {
    const messageID = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const state = get();
    const sessionID = state.currentSession?.id ?? '';

    const optimisticMessage: MessageWithParts = {
      info: {
        id: messageID,
        sessionID,
        role: 'user' as const,
        time: { created: Math.floor(Date.now() / 1000) },
        agent: '',
        model: { providerID: '', modelID: '' },
      },
      parts: createOptimisticMessageParts(messageID, text, images),
    };

    set({
      messages: [...state.messages, optimisticMessage],
      optimisticMessageID: messageID,
      savedInputText: state.inputText,
      inputText: '',
      attachedImages: [],
    });

    return messageID;
  },

  rollbackOptimisticMessage: () => {
    const state = get();
    if (!state.optimisticMessageID) return;

    set({
      messages: state.messages.filter(m => m.info.id !== state.optimisticMessageID),
      inputText: state.savedInputText ?? '',
      optimisticMessageID: undefined,
      savedInputText: undefined,
    });
  },

  confirmOptimisticMessage: () => {
    set({
      optimisticMessageID: undefined,
      savedInputText: undefined,
      sessionStatus: 'active',
      isStreaming: true,
    });
  },

  clear: () =>
    set({
      currentSession: undefined,
      messages: [],
      sessionStatus: 'idle',
      inputText: '',
      isStreaming: false,
      attachedImages: [],
      optimisticMessageID: undefined,
      savedInputText: undefined,
      bufferedRealtimeParts: {},
      pendingPermission: undefined,
      pendingQuestion: undefined,
    }),
}));
