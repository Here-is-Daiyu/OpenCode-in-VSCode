/**
 * NotificationToast — Lightweight notification toast stack
 */

import React from 'react';
import { useNotificationStore, type ToastItem, type NotificationType } from '../stores/notificationStore';

function getIconClass(type: NotificationType): string {
  switch (type) {
    case 'completed':
      return 'codicon codicon-check';
    case 'error':
      return 'codicon codicon-error';
    case 'permission':
      return 'codicon codicon-shield';
    case 'info':
      return 'codicon codicon-info';
  }
}

function NotificationToast({ toast }: { toast: ToastItem }) {
  const dismissToast = useNotificationStore((s) => s.dismissToast);
  const pauseToast = useNotificationStore((s) => s.pauseToast);
  const resumeToast = useNotificationStore((s) => s.resumeToast);

  const { notification, exiting } = toast;

  return (
    <div
      className={`notification-toast notification-toast--${notification.type}${exiting ? ' notification-toast--exiting' : ''}`}
      onMouseEnter={() => pauseToast(notification.id)}
      onMouseLeave={() => resumeToast(notification.id)}
    >
      <span className="notification-toast__icon">
        <span className={getIconClass(notification.type)}></span>
      </span>
      <div className="notification-toast__content">
        <div className="notification-toast__title">{notification.title}</div>
        {notification.body && (
          <div className="notification-toast__body">{notification.body}</div>
        )}
      </div>
      <button
        className="notification-toast__dismiss"
        onClick={() => dismissToast(notification.id)}
        title="Dismiss"
      >
        <span className="codicon codicon-close"></span>
      </button>
    </div>
  );
}

export function NotificationToastContainer() {
  const toasts = useNotificationStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="notification-toast-container">
      {toasts.map((toast) => (
        <NotificationToast key={toast.notification.id} toast={toast} />
      ))}
    </div>
  );
}
