/**
 * Chat state management using Zustand
 */

import { create } from 'zustand';
import type {
  Session,
  MessageWithParts,
  Part,
  PermissionRequest,
  Question,
  TextPart,
} from '../types/opencode';

export interface ChatState {
  // Connection
  connected: boolean;
  version?: string;

  // Session
  currentSession?: Session;
  messages: MessageWithParts[];
  sessionStatus: 'idle' | 'active' | 'error' | 'compacting' | 'retry';

  // UI
  inputText: string;
  isStreaming: boolean;
  attachedImages: string[];

  // Optimistic message tracking for rollback
  optimisticMessageID?: string;
  savedInputText?: string;

  // Prompts
  pendingPermission?: PermissionRequest;
  pendingQuestion?: Question;

  // Actions
  setConnected: (connected: boolean, version?: string) => void;
  setSession: (session: Session, messages: MessageWithParts[]) => void;
  updateSession: (session: Session) => void;
  clearSession: () => void;
  setSessionStatus: (status: 'idle' | 'active' | 'error' | 'compacting' | 'retry') => void;
  addMessage: (message: MessageWithParts) => void;
  updateMessage: (message: MessageWithParts) => void;
  updatePart: (messageID: string, part: Part) => void;
  appendPartDelta: (messageID: string, partID: string, delta: string) => void;
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
  pendingPermission: undefined,
  pendingQuestion: undefined,

  // Actions
  setConnected: (connected, version) => set({ connected, version }),

  setSession: (session, messages) =>
    set({
      currentSession: session,
      messages,
      sessionStatus: 'idle',
      isStreaming: false,
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
      pendingPermission: undefined,
      pendingQuestion: undefined,
      optimisticMessageID: undefined,
      savedInputText: undefined,
    }),

  setSessionStatus: (status) => {
    set({ sessionStatus: status });
    if (status === 'idle') {
      set({ isStreaming: false });
    } else if (status === 'active') {
      set({ isStreaming: true });
    }
    // 'retry' keeps isStreaming as-is (server is retrying)
  },

  addMessage: (message) =>
    set((state) => {
      // Don't add duplicate messages
      const exists = state.messages.some((m) => m.info.id === message.info.id);
      if (exists) {
        // Update instead
        return {
          messages: state.messages.map((m) =>
            m.info.id === message.info.id ? message : m
          ),
        };
      }
      return { messages: [...state.messages, message] };
    }),

  updateMessage: (message) =>
    set((state) => {
      const index = state.messages.findIndex((m) => m.info.id === message.info.id);
      if (index === -1) {
        // Message not found, add it
        return { messages: [...state.messages, message] };
      }
      const updated = [...state.messages];
      updated[index] = message;
      return { messages: updated };
    }),

  updatePart: (messageID, part) =>
    set((state) => {
      const msgIndex = state.messages.findIndex((m) => m.info.id === messageID);
      if (msgIndex === -1) return state;

      const msg = state.messages[msgIndex];
      const partIndex = msg.parts.findIndex((p) => p.id === part.id);

      let newParts: Part[];
      if (partIndex === -1) {
        // New part, append
        newParts = [...msg.parts, part];
      } else {
        // Update existing part
        newParts = [...msg.parts];
        newParts[partIndex] = part;
      }

      const updated = [...state.messages];
      updated[msgIndex] = { ...msg, parts: newParts };
      return { messages: updated };
    }),

  appendPartDelta: (messageID, partID, delta) =>
    set((state) => {
      if (!delta) {
        return state;
      }

      const msgIndex = state.messages.findIndex((m) => m.info.id === messageID);
      if (msgIndex === -1) {
        return state;
      }

      const msg = state.messages[msgIndex];
      const partIndex = msg.parts.findIndex((p) => p.id === partID);

      let newParts: Part[];
      if (partIndex === -1) {
        const streamedTextPart: TextPart = {
          type: 'text',
          id: partID,
          text: delta,
          sessionID: msg.info.sessionID,
          messageID,
        };
        newParts = [...msg.parts, streamedTextPart];
      } else {
        const existingPart = msg.parts[partIndex];
        if (existingPart.type !== 'text' && existingPart.type !== 'reasoning') {
          return state;
        }

        newParts = [...msg.parts];
        newParts[partIndex] = {
          ...existingPart,
          text: existingPart.text + delta,
        };
      }

      const updated = [...state.messages];
      updated[msgIndex] = { ...msg, parts: newParts };
      return { messages: updated };
    }),

  removeMessage: (messageID) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.info.id !== messageID),
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
      parts: [
        {
          type: 'text' as const,
          id: `${messageID}_text`,
          text,
        },
      ],
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
      pendingPermission: undefined,
      pendingQuestion: undefined,
    }),
}));
