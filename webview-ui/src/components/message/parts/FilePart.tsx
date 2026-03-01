/**
 * FilePart - Renders a file reference / attachment display.
 */

import React, { useCallback } from 'react';
import type { FilePart as FilePartType } from '../../../types/opencode';
import { postMessage } from '../../../utils/vscodeApi';

interface FilePartProps {
  part: FilePartType;
}

export const FilePart = React.memo(function FilePart({ part }: FilePartProps) {
  const mimeType = part.mime ?? part.mediaType ?? '';
  const isImage = mimeType.startsWith('image/');
  const fileName = part.filename.split('/').pop() ?? part.filename;

  const handleClick = useCallback(() => {
    if (!isImage) {
      postMessage({ type: 'file:open', data: { path: part.filename } });
    }
  }, [part.filename, isImage]);

  return (
    <div className="msg-file" onClick={handleClick} role={isImage ? undefined : 'button'} tabIndex={isImage ? undefined : 0}>
      <span className="msg-file__icon">
        {isImage ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14 1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zm0 13H2V2h12v12zM4 11l2-3 1.5 2L10 7l3 4H4z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.85 4.44l-3.28-3.3-.35-.14H3.5l-.5.5v13l.5.5h9l.5-.5V4.8l-.15-.36zM10 1.94L12.06 4H10V1.94zM4 14V2h5v3h3v9H4z" />
          </svg>
        )}
      </span>
      <span className="msg-file__name" title={part.filename}>{fileName}</span>
      {isImage && part.url && (
        <img className="msg-file__preview" src={part.url} alt={fileName} loading="lazy" />
      )}
    </div>
  );
});
