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
  Agent,
} from '../types/opencode';

export type ChatSessionStatus = OpenCodeSessionStatus['status'];

type ChatSessionStatusInput = ChatSessionStatus | 'busy' | undefined;

type BufferedRealtimeParts = Record<string, Part[]>;

export interface ChatImageAttachment {
  id: string;
  marker: string;
  markerNumber: number;
  dataUrl: string;
}

export interface PendingInputInsertion {
  id: string;
  text: string;
  focus: boolean;
}

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

function createOptimisticMessage(
  messageID: string,
  sessionID: string,
  text: string,
  images?: string[],
): MessageWithParts {
  return {
    info: {
      id: messageID,
      sessionID,
      role: 'user' as const,
      time: { created: Math.floor(Date.now() / 1000) },
      agent: '',
      model: { providerID: '', modelID: '' },
    },
    parts: createOptimisticMessageParts(messageID, text, images),
  } satisfies MessageWithParts;
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

function getRevertMessageID(session?: Session): string | undefined {
  return session?.revert?.messageID;
}

function isUserMessage(message: MessageWithParts): boolean {
  return message.info.role === 'user';
}

function getUserMessages(messages: MessageWithParts[]): MessageWithParts[] {
  return messages.filter(isUserMessage);
}

function getImageMarker(markerNumber: number): string {
  return `[Image ${markerNumber}]`;
}

function ensureImageMarkers(text: string, images: ChatImageAttachment[]): string {
  if (images.length === 0) {
    return text;
  }

  const missingMarkers = images
    .map((image) => image.marker)
    .filter((marker) => !text.includes(marker));

  if (missingMarkers.length === 0) {
    return text;
  }

  return text ? `${text} ${missingMarkers.join(' ')}` : missingMarkers.join(' ');
}

function createDraftImageAttachment(part: FilePart, index: number): ChatImageAttachment | undefined {
  const mime = (part.mime ?? part.mediaType ?? '').toLowerCase();
  const dataUrl = typeof part.url === 'string' ? part.url.trim() : '';

  if (!mime.startsWith('image/') || !dataUrl) {
    return undefined;
  }

  const markerNumber = index + 1;
  return {
    id: `revert_${part.id}`,
    marker: getImageMarker(markerNumber),
    markerNumber,
    dataUrl,
  } satisfies ChatImageAttachment;
}

function getRevertDraft(message: MessageWithParts): {
  messageID: string;
  text: string;
  images: ChatImageAttachment[];
} {
  const text = message.parts
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
  const images = message.parts
    .filter((part): part is FilePart => part.type === 'file')
    .map((part, index) => createDraftImageAttachment(part, index))
    .filter((image): image is ChatImageAttachment => Boolean(image));

  return {
    messageID: message.info.id,
    text: ensureImageMarkers(text, images),
    images,
  };
}

export function getVisibleMessages(messages: MessageWithParts[], session?: Session): MessageWithParts[] {
  const revertMessageID = getRevertMessageID(session);
  if (!revertMessageID) {
    return messages;
  }

  const revertIndex = messages.findIndex((message) => message.info.id === revertMessageID);
  return revertIndex >= 0 ? messages.slice(0, revertIndex) : [];
}

export function getUndoTargetMessage(
  messages: MessageWithParts[],
  session?: Session,
): MessageWithParts | undefined {
  const userMessages = getUserMessages(messages);
  if (userMessages.length === 0) {
    return undefined;
  }

  const revertMessageID = getRevertMessageID(session);
  if (!revertMessageID) {
    return userMessages[userMessages.length - 1];
  }

  const revertIndex = userMessages.findIndex((message) => message.info.id === revertMessageID);
  return revertIndex > 0 ? userMessages[revertIndex - 1] : undefined;
}

export function getRedoTargetMessage(
  messages: MessageWithParts[],
  session?: Session,
): MessageWithParts | undefined {
  const revertMessageID = getRevertMessageID(session);
  if (!revertMessageID) {
    return undefined;
  }

  const userMessages = getUserMessages(messages);
  const revertIndex = userMessages.findIndex((message) => message.info.id === revertMessageID);
  return revertIndex >= 0 && revertIndex < userMessages.length - 1
    ? userMessages[revertIndex + 1]
    : undefined;
}

export function countRevertedUserMessages(messages: MessageWithParts[], session?: Session): number {
  const revertMessageID = getRevertMessageID(session);
  if (!revertMessageID) {
    return 0;
  }

  const userMessages = getUserMessages(messages);
  const revertIndex = userMessages.findIndex((message) => message.info.id === revertMessageID);
  return revertIndex >= 0 ? userMessages.length - revertIndex : 0;
}

interface DerivedChatStatePatch {
  visibleMessages: MessageWithParts[];
  lastAppliedRevertMessageID?: string;
  inputText?: string;
  attachedImages?: ChatImageAttachment[];
}

function getDerivedChatStatePatch(
  session: Session | undefined,
  messages: MessageWithParts[],
  lastAppliedRevertMessageID?: string,
): DerivedChatStatePatch {
  const visibleMessages = getVisibleMessages(messages, session);
  const revertMessageID = getRevertMessageID(session);

  if (!revertMessageID) {
    return {
      visibleMessages,
      lastAppliedRevertMessageID: undefined,
    };
  }

  if (lastAppliedRevertMessageID === revertMessageID) {
    return {
      visibleMessages,
      lastAppliedRevertMessageID,
    };
  }

  const message = messages.find(
    (item) => item.info.id === revertMessageID && item.info.role === 'user',
  );
  if (!message) {
    return {
      visibleMessages,
      lastAppliedRevertMessageID: undefined,
    };
  }

  const draft = getRevertDraft(message);
  return {
    visibleMessages,
    lastAppliedRevertMessageID: revertMessageID,
    inputText: draft.text,
    attachedImages: draft.images,
  };
}

export interface ChatState {
  // Connection
  connected: boolean;
  version?: string;

  // Session
  currentSession?: Session;
  messages: MessageWithParts[];
  visibleMessages: MessageWithParts[];
  sessionStatus: ChatSessionStatus;

  // UI
  inputText: string;
  isStreaming: boolean;
  attachedImages: ChatImageAttachment[];
  pendingInputInsertions: PendingInputInsertion[];

  // Optimistic message tracking for rollback
  optimisticMessageID?: string;
  savedInputText?: string;
  savedAttachedImages?: ChatImageAttachment[];
  bufferedRealtimeParts: BufferedRealtimeParts;
  lastAppliedRevertMessageID?: string;

  // Agents
  agents: Agent[];
  selectedAgent: string;

  // Prompts
  pendingPermission?: PermissionRequest;
  pendingQuestion?: Question;

  // Active sessions (other sessions that are busy)
  activeSessionCount: number;

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
  addImage: (image: ChatImageAttachment) => void;
  removeImage: (id: string) => void;
  removeImages: (ids: string[]) => void;
  setAttachedImages: (images: ChatImageAttachment[]) => void;
  clearImages: () => void;
  beginPendingSend: () => void;
  queueInputInsertion: (text: string, focus?: boolean) => void;
  consumeInputInsertion: (id: string) => void;
  setPermission: (permission?: PermissionRequest) => void;
  setQuestion: (question?: Question) => void;
  setAgents: (agents: Agent[]) => void;
  setSelectedAgent: (agent: string) => void;
  addOptimisticMessage: (text: string, images?: string[]) => string;
  addQueuedOptimisticMessage: (text: string, images?: string[]) => string;
  rollbackOptimisticMessage: () => void;
  confirmOptimisticMessage: (streaming?: boolean) => void;
  rollbackQueuedOptimisticMessage: () => void;
  confirmQueuedOptimisticMessage: (streaming?: boolean) => void;
  setActiveSessionCount: (count: number) => void;
  clear: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  connected: false,
  version: undefined,
  currentSession: undefined,
  messages: [],
  visibleMessages: [],
  sessionStatus: 'idle',
  inputText: '',
  isStreaming: false,
  attachedImages: [],
  pendingInputInsertions: [],
  optimisticMessageID: undefined,
  savedInputText: undefined,
  savedAttachedImages: undefined,
  bufferedRealtimeParts: {},
  lastAppliedRevertMessageID: undefined,
  agents: [],
  selectedAgent: '',
  pendingPermission: undefined,
  pendingQuestion: undefined,
  activeSessionCount: 0,

  // Actions
  setConnected: (connected, version) => set({ connected, version }),

  setSession: (session, messages) =>
    set((state) => {
      const nextMessages = messages.map((message) => {
        const normalizedMessage = normalizeMessageParts(message);
        return mergeBufferedPartsIntoMessage(
          normalizedMessage,
          get().bufferedRealtimeParts[normalizedMessage.info.id],
        );
      });
      const derived = getDerivedChatStatePatch(
        session,
        nextMessages,
        state.lastAppliedRevertMessageID,
      );

      return {
        currentSession: session,
        messages: nextMessages,
        ...derived,
        sessionStatus: 'idle',
        isStreaming: false,
        bufferedRealtimeParts: {},
        pendingPermission: undefined,
        pendingQuestion: undefined,
      };
    }),

  updateSession: (session) =>
    set((state) => {
      const currentSession = state.currentSession?.id === session.id ? session : state.currentSession;
      if (currentSession === state.currentSession) {
        return state;
      }

      return {
        currentSession,
        ...getDerivedChatStatePatch(
          currentSession,
          state.messages,
          state.lastAppliedRevertMessageID,
        ),
      };
    }),

  clearSession: () =>
    set({
      currentSession: undefined,
      messages: [],
      visibleMessages: [],
      sessionStatus: 'idle',
      isStreaming: false,
      bufferedRealtimeParts: {},
      lastAppliedRevertMessageID: undefined,
      pendingPermission: undefined,
      pendingQuestion: undefined,
      optimisticMessageID: undefined,
      savedInputText: undefined,
      savedAttachedImages: undefined,
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
      const nextMessages = [...uniqueMessages, ...state.messages];
      return {
        messages: nextMessages,
        ...getDerivedChatStatePatch(
          state.currentSession,
          nextMessages,
          state.lastAppliedRevertMessageID,
        ),
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
        const nextMessages = state.messages.map((m) =>
          m.info.id === mergedMessage.info.id
            ? normalizeMessageParts(mergedMessage, existingMessage?.parts)
            : m
        );
        // Update instead
        return {
          messages: nextMessages,
          ...getDerivedChatStatePatch(
            state.currentSession,
            nextMessages,
            state.lastAppliedRevertMessageID,
          ),
          bufferedRealtimeParts: nextBufferedRealtimeParts,
        };
      }
      const nextMessages = [...state.messages, mergedMessage];
      return {
        messages: nextMessages,
        ...getDerivedChatStatePatch(
          state.currentSession,
          nextMessages,
          state.lastAppliedRevertMessageID,
        ),
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
        const optimisticID = state.optimisticMessageID;
        if (optimisticID && normalizedMessage.info.role === 'user') {
          const optIndex = state.messages.findIndex(m => m.info.id === optimisticID);
          if (optIndex !== -1) {
            const nextMessages = [...state.messages];
            nextMessages[optIndex] = normalizedMessage;
            return {
              messages: nextMessages,
              ...getDerivedChatStatePatch(
                state.currentSession,
                nextMessages,
                state.lastAppliedRevertMessageID,
              ),
              bufferedRealtimeParts: nextBufferedRealtimeParts,
              optimisticMessageID: undefined,
            };
          }
        }

        // Message not found, add it
        const nextMessages = [...state.messages, normalizedMessage];
        return {
          messages: nextMessages,
          ...getDerivedChatStatePatch(
            state.currentSession,
            nextMessages,
            state.lastAppliedRevertMessageID,
          ),
          bufferedRealtimeParts: nextBufferedRealtimeParts,
        };
      }
      const updated = [...state.messages];
      updated[index] = normalizedMessage;
      return {
        messages: updated,
        ...getDerivedChatStatePatch(
          state.currentSession,
          updated,
          state.lastAppliedRevertMessageID,
        ),
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
      return {
        messages: updated,
        ...getDerivedChatStatePatch(
          state.currentSession,
          updated,
          state.lastAppliedRevertMessageID,
        ),
      };
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
      return {
        messages: updated,
        ...getDerivedChatStatePatch(
          state.currentSession,
          updated,
          state.lastAppliedRevertMessageID,
        ),
      };
    }),

  removeMessage: (messageID) =>
    set((state) => {
      const nextMessages = state.messages.filter((message) => message.info.id !== messageID);
      return {
        messages: nextMessages,
        ...getDerivedChatStatePatch(
          state.currentSession,
          nextMessages,
          state.lastAppliedRevertMessageID,
        ),
        bufferedRealtimeParts: omitBufferedParts(state.bufferedRealtimeParts, messageID),
      };
    }),

  setInputText: (text) => set({ inputText: text }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  addImage: (image) =>
    set((state) => ({
      attachedImages: state.attachedImages.some((existing) => existing.id === image.id)
        ? state.attachedImages
        : [...state.attachedImages, image],
    })),

  removeImage: (id) =>
    set((state) => ({
      attachedImages: state.attachedImages.filter((image) => image.id !== id),
    })),

  removeImages: (ids) =>
    set((state) => {
      if (ids.length === 0) {
        return state;
      }

      const idSet = new Set(ids);
      return {
        attachedImages: state.attachedImages.filter((image) => !idSet.has(image.id)),
      };
    }),

  setAttachedImages: (images) => set({ attachedImages: images }),

  clearImages: () => set({ attachedImages: [] }),

  beginPendingSend: () =>
    set((state) => ({
      optimisticMessageID: undefined,
      savedInputText: state.inputText,
      savedAttachedImages: state.attachedImages,
      inputText: '',
      attachedImages: [],
    })),

  queueInputInsertion: (text, focus = true) =>
    set((state) => ({
      pendingInputInsertions: [
        ...state.pendingInputInsertions,
        {
          id: `insert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          text,
          focus,
        },
      ],
    })),

  consumeInputInsertion: (id) =>
    set((state) => ({
      pendingInputInsertions: state.pendingInputInsertions.filter((item) => item.id !== id),
    })),

  setPermission: (permission) => set({ pendingPermission: permission }),

  setQuestion: (question) => set({ pendingQuestion: question }),

  setAgents: (agents) => set({ agents }),

  setSelectedAgent: (agent) => set({ selectedAgent: agent }),

  addOptimisticMessage: (text, images) => {
    const messageID = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const state = get();
    const sessionID = state.currentSession?.id ?? '';

    const optimisticMessage = createOptimisticMessage(messageID, sessionID, text, images);

    const nextMessages = [...state.messages, optimisticMessage];
    set({
      messages: nextMessages,
      ...getDerivedChatStatePatch(
        state.currentSession,
        nextMessages,
        state.lastAppliedRevertMessageID,
      ),
      optimisticMessageID: messageID,
      savedInputText: state.inputText,
      savedAttachedImages: state.attachedImages,
      inputText: '',
      attachedImages: [],
    });

    return messageID;
  },

  addQueuedOptimisticMessage: (text, images) => {
    const messageID = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const state = get();
    const sessionID = state.currentSession?.id ?? '';
    const optimisticMessage = createOptimisticMessage(messageID, sessionID, text, images);
    const nextMessages = [...state.messages, optimisticMessage];

    set({
      messages: nextMessages,
      ...getDerivedChatStatePatch(
        state.currentSession,
        nextMessages,
        state.lastAppliedRevertMessageID,
      ),
      optimisticMessageID: messageID,
      savedInputText: undefined,
      savedAttachedImages: undefined,
    });

    return messageID;
  },

  rollbackOptimisticMessage: () => {
    const state = get();
    if (!state.optimisticMessageID && state.savedInputText === undefined && state.savedAttachedImages === undefined) {
      return;
    }

    const shouldRestoreInput =
      state.savedInputText !== undefined || state.savedAttachedImages !== undefined;

    const nextMessages = state.optimisticMessageID
      ? state.messages.filter((message) => message.info.id !== state.optimisticMessageID)
      : state.messages;

    set({
      messages: nextMessages,
      ...getDerivedChatStatePatch(
        state.currentSession,
        nextMessages,
        state.lastAppliedRevertMessageID,
      ),
      inputText: shouldRestoreInput ? (state.savedInputText ?? '') : state.inputText,
      attachedImages: shouldRestoreInput ? (state.savedAttachedImages ?? []) : state.attachedImages,
      optimisticMessageID: undefined,
      savedInputText: undefined,
      savedAttachedImages: undefined,
    });
  },

  confirmOptimisticMessage: (streaming = true) =>
    set((state) => ({
      optimisticMessageID: undefined,
      savedInputText: undefined,
      savedAttachedImages: undefined,
      sessionStatus: streaming ? 'active' : state.sessionStatus,
      isStreaming: streaming,
    })),

  rollbackQueuedOptimisticMessage: () => {
    const state = get();
    if (!state.optimisticMessageID) {
      return;
    }

    const nextMessages = state.messages.filter((message) => message.info.id !== state.optimisticMessageID);
    set({
      messages: nextMessages,
      ...getDerivedChatStatePatch(
        state.currentSession,
        nextMessages,
        state.lastAppliedRevertMessageID,
      ),
      optimisticMessageID: undefined,
      savedInputText: undefined,
      savedAttachedImages: undefined,
    });
  },

  confirmQueuedOptimisticMessage: (streaming = true) =>
    set((state) => ({
      optimisticMessageID: undefined,
      savedInputText: undefined,
      savedAttachedImages: undefined,
      sessionStatus: streaming ? 'active' : state.sessionStatus,
      isStreaming: streaming,
    })),

  setActiveSessionCount: (count) => set({ activeSessionCount: count }),

  clear: () =>
    set({
      currentSession: undefined,
      messages: [],
      visibleMessages: [],
      sessionStatus: 'idle',
      inputText: '',
      isStreaming: false,
      attachedImages: [],
      pendingInputInsertions: [],
      optimisticMessageID: undefined,
      savedInputText: undefined,
      savedAttachedImages: undefined,
      bufferedRealtimeParts: {},
      lastAppliedRevertMessageID: undefined,
      agents: [],
      selectedAgent: '',
      pendingPermission: undefined,
      pendingQuestion: undefined,
      activeSessionCount: 0,
    }),
}));
