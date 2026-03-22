const warned = new Set<string>();

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
