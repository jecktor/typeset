import type { TextStyle } from './types';

/**
 * Structural font-metrics interface. In the renderer it is backed by embedded
 * pdf-lib fonts; tests can use a fake. Keeping this structural is what lets
 * /core stay dependency-free while both the renderer's pagination and the
 * editor's fitting hints share the SAME measurement — the WYSIWYG guarantee.
 */
export interface FontMetrics {
  widthOfTextAtSize(text: string, size: number): number;
}

export type MeasureProvider = (fontFamily: string) => FontMetrics;

export const DEFAULT_LINE_HEIGHT = 1.3;

export function lineHeightOf(style: Pick<TextStyle, 'size' | 'lineHeight'>): number {
  return style.size * (style.lineHeight ?? DEFAULT_LINE_HEIGHT);
}

/**
 * Greedy word wrap honoring explicit newlines. A single word wider than
 * maxWidth is emitted on its own line (never broken mid-word).
 */
export function wrapText(
  text: string,
  font: FontMetrics,
  size: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split('\n')) {
    if (!rawLine) {
      lines.push('');
      continue;
    }
    const words = rawLine.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}
