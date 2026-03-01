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
} from '../types/opencode';

export interface ChatState {
  // Connection
  connected: boolean;
  version?: string;

  // Session
  currentSession?: Session;
  messages: MessageWithParts[];
  sessionStatus: 'idle' | 'active' | 'error' | 'compacting';

  // UI
  inputText: string;
  isStreaming: boolean;
  attachedImages: string[];

  // Prompts
  pendingPermission?: PermissionRequest;
  pendingQuestion?: Question;

  // Actions
  setConnected: (connected: boolean, version?: string) => void;
  setSession: (session: Session, messages: MessageWithParts[]) => void;
  updateSession: (session: Session) => void;
  clearSession: () => void;
  setSessionStatus: (status: 'idle' | 'active' | 'error' | 'compacting') => void;
  addMessage: (message: MessageWithParts) => void;
  updateMessage: (message: MessageWithParts) => void;
  updatePart: (messageID: string, part: Part) => void;
  removeMessage: (messageID: string) => void;
  setInputText: (text: string) => void;
  setStreaming: (streaming: boolean) => void;
  addImage: (base64: string) => void;
  removeImage: (index: number) => void;
  clearImages: () => void;
  setPermission: (permission?: PermissionRequest) => void;
  setQuestion: (question?: Question) => void;
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
    }),

  setSessionStatus: (status) => {
    set({ sessionStatus: status });
    // When session becomes idle after being active, stop streaming
    if (status === 'idle') {
      set({ isStreaming: false });
    } else if (status === 'active') {
      set({ isStreaming: true });
    }
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

  clear: () =>
    set({
      currentSession: undefined,
      messages: [],
      sessionStatus: 'idle',
      inputText: '',
      isStreaming: false,
      attachedImages: [],
      pendingPermission: undefined,
      pendingQuestion: undefined,
    }),
}));
