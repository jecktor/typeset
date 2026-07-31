import { describe, expect, it } from 'vitest';
import { formatValue, getByPath, interpolate } from '../src/core';

describe('formatValue', () => {
  it('formats MXN currency for es-MX', () => {
    const out = formatValue(1234.5, { type: 'currency' }, 'es-MX');
    expect(out).toMatch(/1,?234\.50/);
    expect(out).toContain('$');
  });

  it('formats dates with Intl dateStyle patterns', () => {
    const d = new Date(2026, 6, 29);
    const full = formatValue(d, { type: 'date', pattern: 'full' }, 'es-MX');
    expect(full.toLowerCase()).toContain('julio');
  });

  it('renders empty string for null/undefined', () => {
    expect(formatValue(null, { type: 'string' }, 'es-MX')).toBe('');
    expect(formatValue(undefined, undefined, 'es-MX')).toBe('');
  });

  it('localizes booleans', () => {
    expect(formatValue(true, { type: 'boolean' }, 'es-MX')).toBe('Sí');
    expect(formatValue(false, { type: 'boolean' }, 'en-US')).toBe('No');
  });

  it('uses custom formatters via custom: pattern', () => {
    const out = formatValue(
      'ABC',
      { type: 'string', pattern: 'custom:folio' },
      'es-MX',
      { folio: v => `FOLIO-${v}` }
    );
    expect(out).toBe('FOLIO-ABC');
  });
});

describe('getByPath / interpolate', () => {
  const data = { customer: { name: 'ACME' }, items: [{ total: 5 }] };

  it('resolves nested and indexed paths', () => {
    expect(getByPath(data, 'customer.name')).toBe('ACME');
    expect(getByPath(data, 'items.0.total')).toBe(5);
    expect(getByPath(data, 'missing.deep')).toBeUndefined();
  });

  it('interpolates {{placeholders}}', () => {
    const out = interpolate(
      'Cliente: {{customer.name}} ({{missing}})',
      p => getByPath(data, p),
      'es-MX'
    );
    expect(out).toBe('Cliente: ACME ()');
  });
});
