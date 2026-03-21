/**
 * Lightweight ANSI SGR escape sequence to HTML converter.
 *
 * Handles:
 * - Reset (0), Bold (1), Dim (2), Italic (3), Underline (4)
 * - Standard foreground (30-37), bright foreground (90-97)
 * - Standard background (40-47), bright background (100-107)
 * - Default foreground (39), default background (49)
 * - 256-color mode (38;5;N / 48;5;N)
 *
 * All input text is HTML-escaped before being wrapped in spans.
 * Malformed / incomplete sequences are silently stripped.
 */

// ---------------------------------------------------------------------------
// Standard xterm 256-color palette (first 16 entries)
// ---------------------------------------------------------------------------

const STANDARD_COLORS: readonly string[] = [
  '#000000', // 0  Black
  '#cd3131', // 1  Red
  '#0dbc79', // 2  Green
  '#e5e510', // 3  Yellow
  '#2472c8', // 4  Blue
  '#bc3fbc', // 5  Magenta
  '#11a8cd', // 6  Cyan
  '#e5e5e5', // 7  White
  '#666666', // 8  Bright Black
  '#f14c4c', // 9  Bright Red
  '#23d18b', // 10 Bright Green
  '#f5f543', // 11 Bright Yellow
  '#3b8eea', // 12 Bright Blue
  '#d670d6', // 13 Bright Magenta
  '#29b8db', // 14 Bright Cyan
  '#e5e5e5', // 15 Bright White
];

// ---------------------------------------------------------------------------
// 256-color lookup (lazily built)
// ---------------------------------------------------------------------------

let palette256: string[] | undefined;

function getPalette256(): string[] {
  if (palette256) return palette256;

  palette256 = new Array<string>(256);

  // 0-15: standard colors
  for (let i = 0; i < 16; i++) {
    palette256[i] = STANDARD_COLORS[i];
  }

  // 16-231: 6×6×6 RGB cube
  const levels = [0, 0x5f, 0x87, 0xaf, 0xd7, 0xff];
  for (let i = 0; i < 216; i++) {
    const r = levels[Math.floor(i / 36) % 6];
    const g = levels[Math.floor(i / 6) % 6];
    const b = levels[i % 6];
    palette256[16 + i] = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  }

  // 232-255: grayscale ramp
  for (let i = 0; i < 24; i++) {
    const v = 8 + i * 10;
    palette256[232 + i] = `#${hex2(v)}${hex2(v)}${hex2(v)}`;
  }

  return palette256;
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// State tracked while walking through SGR parameters
// ---------------------------------------------------------------------------

interface AnsiState {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  fg: string | null; // CSS color value or null (default)
  bg: string | null;
}

function emptyState(): AnsiState {
  return { bold: false, dim: false, italic: false, underline: false, fg: null, bg: null };
}

function statesEqual(a: AnsiState, b: AnsiState): boolean {
  return (
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.fg === b.fg &&
    a.bg === b.bg
  );
}

function isDefault(s: AnsiState): boolean {
  return !s.bold && !s.dim && !s.italic && !s.underline && s.fg === null && s.bg === null;
}

// ---------------------------------------------------------------------------
// Build inline style string from state
// ---------------------------------------------------------------------------

function stateToStyle(s: AnsiState): string {
  const parts: string[] = [];
  if (s.bold) parts.push('font-weight:bold');
  if (s.dim) parts.push('opacity:0.6');
  if (s.italic) parts.push('font-style:italic');
  if (s.underline) parts.push('text-decoration:underline');
  if (s.fg) parts.push(`color:${s.fg}`);
  if (s.bg) parts.push(`background-color:${s.bg}`);
  return parts.join(';');
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// SGR parameter application
// ---------------------------------------------------------------------------

function applySgr(params: number[], state: AnsiState): void {
  let i = 0;
  while (i < params.length) {
    const p = params[i];

    if (p === 0) {
      // Reset
      Object.assign(state, emptyState());
    } else if (p === 1) {
      state.bold = true;
    } else if (p === 2) {
      state.dim = true;
    } else if (p === 3) {
      state.italic = true;
    } else if (p === 4) {
      state.underline = true;
    } else if (p === 22) {
      state.bold = false;
      state.dim = false;
    } else if (p === 23) {
      state.italic = false;
    } else if (p === 24) {
      state.underline = false;
    } else if (p >= 30 && p <= 37) {
      state.fg = STANDARD_COLORS[p - 30];
    } else if (p === 39) {
      state.fg = null;
    } else if (p >= 40 && p <= 47) {
      state.bg = STANDARD_COLORS[p - 40];
    } else if (p === 49) {
      state.bg = null;
    } else if (p >= 90 && p <= 97) {
      state.fg = STANDARD_COLORS[p - 90 + 8];
    } else if (p >= 100 && p <= 107) {
      state.bg = STANDARD_COLORS[p - 100 + 8];
    } else if (p === 38 || p === 48) {
      // Extended color: 38;5;N (256-color) or 38;2;R;G;B (truecolor)
      const isFg = p === 38;
      if (i + 1 < params.length && params[i + 1] === 5) {
        // 256-color
        if (i + 2 < params.length) {
          const idx = params[i + 2];
          if (idx >= 0 && idx <= 255) {
            const color = getPalette256()[idx];
            if (isFg) state.fg = color;
            else state.bg = color;
          }
          i += 2;
        } else {
          i = params.length; // malformed, skip rest
        }
      } else if (i + 1 < params.length && params[i + 1] === 2) {
        // Truecolor (24-bit): 38;2;R;G;B
        if (i + 4 < params.length) {
          const r = Math.min(255, Math.max(0, params[i + 2]));
          const g = Math.min(255, Math.max(0, params[i + 3]));
          const b = Math.min(255, Math.max(0, params[i + 4]));
          const color = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
          if (isFg) state.fg = color;
          else state.bg = color;
          i += 4;
        } else {
          i = params.length;
        }
      }
    }
    // Unknown codes are silently ignored

    i++;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Regex to detect ANSI escape sequences (for fast-path check)
const ANSI_RE = /\x1b\[/;

/**
 * Returns `true` if the text contains at least one ANSI escape sequence.
 */
export function containsAnsi(text: string): boolean {
  return ANSI_RE.test(text);
}

/**
 * Convert a string with ANSI SGR escape codes to sanitized HTML.
 *
 * - All text is HTML-escaped before wrapping in `<span>` elements.
 * - Inline `style` attributes are used for coloring.
 * - Malformed / incomplete sequences are silently stripped.
 */
export function ansiToHtml(text: string): string {
  // Fast path: no escape sequences at all
  if (!containsAnsi(text)) {
    return escapeHtml(text);
  }

  const out: string[] = [];
  const state = emptyState();
  let spanOpen = false;

  // Match: ESC[ followed by optional digits/semicolons, terminated by a letter
  // We capture everything between ESC[ and the final letter.
  const seqRe = /\x1b\[([\d;]*)([A-Za-z])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = seqRe.exec(text)) !== null) {
    // Emit text before this sequence
    const before = text.slice(lastIndex, match.index);
    if (before) {
      emitText(before, state, out, spanOpen);
      // After emitText, spanOpen state may have changed — track via closure variable
      spanOpen = !isDefault(state);
    }
    lastIndex = seqRe.lastIndex;

    // Only process SGR sequences (terminated by 'm')
    if (match[2] === 'm') {
      const paramStr = match[1];
      const oldState = { ...state };

      if (paramStr === '' || paramStr === '0') {
        Object.assign(state, emptyState());
      } else {
        const params = paramStr.split(';').map((s) => (s === '' ? 0 : parseInt(s, 10)));
        applySgr(params, state);
      }

      // If state changed and we had a span open, close it
      if (!statesEqual(oldState, state) && spanOpen) {
        out.push('</span>');
        spanOpen = false;
      }
    }
    // Non-SGR sequences (cursor movement, etc.) are silently stripped
  }

  // Emit remaining text after last sequence
  const remaining = text.slice(lastIndex);
  if (remaining) {
    emitText(remaining, state, out, spanOpen);
    spanOpen = !isDefault(state);
  }

  // Close any dangling span
  if (spanOpen) {
    out.push('</span>');
  }

  return out.join('');
}

function emitText(
  raw: string,
  state: AnsiState,
  out: string[],
  spanAlreadyOpen: boolean,
): void {
  const escaped = escapeHtml(raw);
  if (isDefault(state)) {
    out.push(escaped);
  } else if (spanAlreadyOpen) {
    out.push(escaped);
  } else {
    out.push(`<span style="${stateToStyle(state)}">${escaped}`);
    // Note: caller tracks spanOpen based on isDefault(state)
  }
}
