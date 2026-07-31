import type { CSSProperties } from 'react';

/**
 * Host-supplied colors for the editor/module UI. Every value is optional;
 * anything omitted keeps the default. `accentSoft` is derived from `accent`
 * automatically unless provided.
 */
export interface EditorTheme {
  /** Brand color: primary buttons, selections, highlights. */
  accent?: string;
  accentSoft?: string;
  /** App background behind panels. */
  surface?: string;
  /** Panel/toolbar background. */
  panel?: string;
  border?: string;
  text?: string;
  muted?: string;
  danger?: string;
}

const VAR_NAMES: Record<keyof EditorTheme, string> = {
  accent: '--pde-accent',
  accentSoft: '--pde-accent-soft',
  surface: '--pde-surface',
  panel: '--pde-panel',
  border: '--pde-border',
  text: '--pde-text',
  muted: '--pde-muted',
  danger: '--pde-danger'
};

/** Turn a theme into inline CSS custom properties for a pde root element. */
export function themeStyle(theme?: EditorTheme): CSSProperties | undefined {
  if (!theme) return undefined;
  const style: Record<string, string> = {};
  for (const [key, varName] of Object.entries(VAR_NAMES)) {
    const value = theme[key as keyof EditorTheme];
    if (value) style[varName] = value;
  }
  return Object.keys(style).length > 0 ? (style as CSSProperties) : undefined;
}
