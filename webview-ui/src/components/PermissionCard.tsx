/**
 * PermissionCard - Shows a permission request with Allow/Deny/Always Allow actions
 */

import React from 'react';
import type { PermissionRequest } from '../types/opencode';
import { postMessage } from '../utils/vscodeApi';
import { useChatStore } from '../stores/chatStore';

interface PermissionCardProps {
  permission: PermissionRequest;
}

export function PermissionCard({ permission }: PermissionCardProps) {
  const setPermission = useChatStore((s) => s.setPermission);

  const handleRespond = (response: string, remember?: boolean) => {
    postMessage({
      type: 'permission:respond',
      data: { id: permission.id, response, remember },
    });
    setPermission(undefined);
  };

  return (
    <div className="permission-card">
      <div className="permission-card__header">
        <span className="permission-card__icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a5 5 0 0 0-5 5v2H2v6h12V8h-1V6a5 5 0 0 0-5-5zm3 7H5V6a3 3 0 1 1 6 0v2z" />
          </svg>
        </span>
        <span className="permission-card__title">Permission Required</span>
      </div>

      <div className="permission-card__body">
        <div className="permission-card__tool">
          Tool: <strong>{permission.tool}</strong>
        </div>
        <div className="permission-card__description">
          {permission.description}
        </div>

        {Object.keys(permission.input).length > 0 && (
          <details className="permission-card__details">
            <summary>Input details</summary>
            <pre className="permission-card__input">
              <code>{JSON.stringify(permission.input, null, 2)}</code>
            </pre>
          </details>
        )}
      </div>

      <div className="permission-card__actions">
        <button
          className="permission-card__btn permission-card__btn--deny"
          onClick={() => handleRespond('deny')}
        >
          Deny
        </button>
        <button
          className="permission-card__btn permission-card__btn--allow"
          onClick={() => handleRespond('allow')}
        >
          Allow
        </button>
        <button
          className="permission-card__btn permission-card__btn--always"
          onClick={() => handleRespond('allow', true)}
        >
          Always Allow
        </button>
      </div>
    </div>
  );
}
