/**
 * FilePart - Renders a file reference / attachment display.
 *
 * Images display as compact `[IMG n]` tag pills with a tinted background.
 * Click to open a lightbox with the full image.
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { FilePart as FilePartType } from '../../../types/opencode';
import { postMessage } from '../../../utils/vscodeApi';

interface FilePartProps {
  part: FilePartType;
  /** 1-based image index for the label (only used for images). */
  imageIndex?: number;
}

function getBaseName(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }

  const normalizedPath = path
    .replace(/\\/g, '/')
    .split('#')[0]
    .split('?')[0];
  const segments = normalizedPath.split('/').filter(Boolean);

  return segments[segments.length - 1];
}

function getUrlFileName(url?: string): string | undefined {
  if (!url || url.startsWith('data:')) {
    return undefined;
  }

  try {
    return getBaseName(new URL(url).pathname);
  } catch {
    return getBaseName(url);
  }
}

function getFallbackLabel(mimeType: string): string {
  if (mimeType.startsWith('image/')) {
    return 'Image attachment';
  }

  return 'File attachment';
}

function getOpenTarget(part: FilePartType): string | undefined {
  if (part.url?.startsWith('file://')) {
    return part.url;
  }

  return part.filename;
}

export const FilePart = React.memo(function FilePart({ part, imageIndex }: FilePartProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const mimeType = part.mime ?? part.mediaType ?? '';
  const isImage = mimeType.startsWith('image/');
  const imageUrl = isImage ? part.url : undefined;
  const fileName =
    getBaseName(part.filename) ??
    getUrlFileName(part.url) ??
    getFallbackLabel(mimeType);
  const openTarget = !isImage ? getOpenTarget(part) : undefined;
  const canOpenFile = Boolean(openTarget);
  const canOpenLightbox = Boolean(imageUrl);

  const handleClick = useCallback(() => {
    if (canOpenFile && openTarget) {
      postMessage({ type: 'file:open', data: { path: openTarget } });
    }
  }, [canOpenFile, openTarget]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!canOpenFile) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleClick();
      }
    },
    [canOpenFile, handleClick],
  );

  const handleLightboxOpen = useCallback(() => {
    if (canOpenLightbox) {
      setLightboxOpen(true);
    }
  }, [canOpenLightbox]);

  const handleLightboxClose = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const handleTagKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLSpanElement>) => {
      if (!canOpenLightbox) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setLightboxOpen(true);
      }
    },
    [canOpenLightbox],
  );

  useEffect(() => {
    if (!lightboxOpen) {
      return undefined;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightboxOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [lightboxOpen]);

  if (isImage) {
    const label = imageIndex != null ? `IMG${imageIndex}` : 'img';

    return (
      <>
        <span
          className={`msg-image-tag${canOpenLightbox ? ' msg-image-tag--clickable' : ''}`}
          title={`${fileName} — click to view`}
          onClick={canOpenLightbox ? handleLightboxOpen : undefined}
          onKeyDown={canOpenLightbox ? handleTagKeyDown : undefined}
          role={canOpenLightbox ? 'button' : undefined}
          tabIndex={canOpenLightbox ? 0 : undefined}
          aria-label={canOpenLightbox ? `View image ${fileName}` : undefined}
        >
          {label}
        </span>
        {lightboxOpen && imageUrl ? (
          <div
            className="msg-lightbox"
            onClick={handleLightboxClose}
            role="dialog"
            aria-modal="true"
            aria-label={fileName}
          >
            <button
              type="button"
              className="msg-lightbox__close"
              onClick={(event) => {
                event.stopPropagation();
                handleLightboxClose();
              }}
              aria-label="Close image preview"
            >
              ×
            </button>
            <img
              className="msg-lightbox__image"
              src={imageUrl}
              alt={fileName}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div
      className={`msg-file${canOpenFile ? ' msg-file--clickable' : ''}`}
      onClick={canOpenFile ? handleClick : undefined}
      onKeyDown={canOpenFile ? handleKeyDown : undefined}
      role={canOpenFile ? 'button' : undefined}
      tabIndex={canOpenFile ? 0 : undefined}
    >
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
      <span className="msg-file__name" title={part.filename ?? fileName}>{fileName}</span>
    </div>
  );
});
