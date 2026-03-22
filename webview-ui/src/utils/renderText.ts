const warned = new Set<string>();
const IMAGE_MARKER = /\[Image\s+\d+\]/gi;

function warn(context: string, value: unknown): void {
  const type = Array.isArray(value) ? 'array' : typeof value;
  const key = `${context}:${type}`;
  if (warned.has(key)) {
    return;
  }

  warned.add(key);
  console.warn(`[render] Expected string for ${context}, received ${type}`, value);
}

export function toDisplayText(value: unknown, context: string): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value == null) {
    return '';
  }

  warn(context, value);

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  return '';
}

export function hasDisplayText(value: unknown, context: string): boolean {
  return toDisplayText(value, context).trim().length > 0;
}

export function stripImageMarkers(text: string): string {
  if (!text) {
    return '';
  }

  return text
    .replace(IMAGE_MARKER, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
