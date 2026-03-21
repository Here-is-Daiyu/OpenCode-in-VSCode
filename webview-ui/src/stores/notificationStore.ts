/**
 * Notification toast state management using Zustand
 *
 * Lightweight in-webview notification system for transient events.
 */

import { create } from 'zustand';

export type NotificationType = 'completed' | 'error' | 'permission' | 'info';

export interface NotificationEntry {
  id: string;
  type: NotificationType;
  title: string;
  body?: string;
  timestamp: number;
}

export interface ToastItem {
  notification: NotificationEntry;
  exiting: boolean;
}

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 6000;
const EXIT_ANIMATION_MS = 200;

/** Timer management (not serializable, kept outside Zustand) */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTimer(id: string): void {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface NotificationState {
  toasts: ToastItem[];
  push: (type: NotificationType, title: string, body?: string) => void;
  dismissToast: (id: string) => void;
  pauseToast: (id: string) => void;
  resumeToast: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => {
  function scheduleAutoDismiss(id: string): void {
    clearTimer(id);
    const timer = setTimeout(() => {
      get().dismissToast(id);
    }, AUTO_DISMISS_MS);
    timers.set(id, timer);
  }

  function removeToast(id: string): void {
    clearTimer(id);
    set((state) => ({
      toasts: state.toasts.filter((t) => t.notification.id !== id),
    }));
  }

  return {
    toasts: [],

    push: (type, title, body) => {
      const id = generateId();
      const notification: NotificationEntry = {
        id,
        type,
        title,
        body,
        timestamp: Date.now(),
      };

      set((state) => {
        let toasts = [...state.toasts, { notification, exiting: false }];

        // Remove oldest if over max
        while (toasts.length > MAX_TOASTS) {
          const oldest = toasts[0];
          clearTimer(oldest.notification.id);
          toasts = toasts.slice(1);
        }

        return { toasts };
      });

      scheduleAutoDismiss(id);
    },

    dismissToast: (id) => {
      clearTimer(id);

      // Set exiting state for animation
      set((state) => ({
        toasts: state.toasts.map((t) =>
          t.notification.id === id ? { ...t, exiting: true } : t,
        ),
      }));

      // Remove after exit animation
      setTimeout(() => removeToast(id), EXIT_ANIMATION_MS);
    },

    pauseToast: (id) => {
      clearTimer(id);
    },

    resumeToast: (id) => {
      const toast = get().toasts.find((t) => t.notification.id === id);
      if (toast && !toast.exiting) {
        scheduleAutoDismiss(id);
      }
    },
  };
});
