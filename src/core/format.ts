import type { ValueFormat } from './types';

/** Host-registered formatters, referenced by pattern 'custom:<name>'. */
export type FormatterRegistry = Record<
  string,
  (value: unknown, locale: string) => string
>;

const YES_NO: Record<string, [string, string]> = {
  es: ['Sí', 'No'],
  en: ['Yes', 'No']
};

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Turn a bound value into display text. Missing values ('' | null | undefined)
 * render as an empty string — the editor warns about unbound fields instead.
 */
export function formatValue(
  value: unknown,
  format: ValueFormat | undefined,
  locale: string,
  formatters?: FormatterRegistry
): string {
  if (value == null || value === '') return '';

  const pattern = format?.pattern;
  if (pattern?.startsWith('custom:')) {
    const custom = formatters?.[pattern.slice('custom:'.length)];
    if (custom) return custom(value, locale);
  }

  switch (format?.type) {
    case 'currency':
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: pattern && !pattern.startsWith('custom:') ? pattern : 'MXN'
      }).format(Number(value));
    case 'date': {
      const d = toDate(value);
      if (!d) return String(value);
      const style =
        pattern === 'full' || pattern === 'long' || pattern === 'medium' || pattern === 'short'
          ? pattern
          : 'long';
      return new Intl.DateTimeFormat(locale, { dateStyle: style }).format(d);
    }
    case 'number': {
      const n = Number(value);
      if (isNaN(n)) return String(value);
      return new Intl.NumberFormat(locale, {
        maximumFractionDigits: pattern === 'int' ? 0 : undefined
      }).format(n);
    }
    case 'boolean': {
      const lang = locale.split('-')[0] ?? 'es';
      const pair = YES_NO[lang] ?? YES_NO.es!;
      return value ? pair[0] : pair[1];
    }
    default: {
      const d = value instanceof Date ? value : null;
      if (d) {
        return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(d);
      }
      return String(value);
    }
  }
}

/** Interpolate {{dot.path}} placeholders in static text. */
export function interpolate(
  content: string,
  resolve: (path: string) => unknown,
  locale: string,
  formatters?: FormatterRegistry
): string {
  return content.replace(/\{\{([^}]+)\}\}/g, (_, rawPath: string) =>
    formatValue(resolve(rawPath.trim()), undefined, locale, formatters)
  );
}
