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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function formatJson(value: unknown): string {
  try {
    if (value == null) {
      return '{}';
    }

    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value ?? '{}');
  }
}

export function PermissionCard({ permission }: PermissionCardProps) {
  const setPermission = useChatStore((s) => s.setPermission);
  const input = isRecord(permission.input) ? permission.input : {};
  const hasInput = Object.keys(input).length > 0;
  const description = typeof permission.description === 'string' ? permission.description : '';
  const tool = typeof permission.tool === 'string' && permission.tool ? permission.tool : 'unknown';

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
          Tool: <strong>{tool}</strong>
        </div>
        <div className="permission-card__description">{description}</div>

        {hasInput && (
          <details className="permission-card__details">
            <summary>Input details</summary>
            <pre className="permission-card__input">
              <code>{formatJson(permission.input)}</code>
            </pre>
          </details>
        )}
      </div>

      <div className="permission-card__actions">
        <button
          className="permission-card__btn permission-card__btn--deny"
          onClick={() => handleRespond('deny')}
          type="button"
        >
          Deny
        </button>
        <button
          className="permission-card__btn permission-card__btn--allow"
          onClick={() => handleRespond('allow')}
          type="button"
        >
          Allow
        </button>
        <button
          className="permission-card__btn permission-card__btn--always"
          onClick={() => handleRespond('allow', true)}
          type="button"
        >
          Always Allow
        </button>
      </div>
    </div>
  );
}
