import { describe, expect, it } from 'vitest';
import {
  createTemplate,
  CURRENT_SCHEMA_VERSION,
  parseTemplate
} from '../src/core';
import { baseTemplate } from './helpers';

describe('parseTemplate', () => {
  it('round-trips a valid template through JSON', () => {
    const template = baseTemplate();
    const parsed = parseTemplate(JSON.parse(JSON.stringify(template)));
    expect(parsed).toEqual(template);
  });

  it('rejects a template without schemaVersion', () => {
    const { schemaVersion: _, ...rest } = baseTemplate() as unknown as Record<string, unknown>;
    expect(() => parseTemplate(rest)).toThrow(/schemaVersion/);
  });

  it('refuses versions newer than the library supports', () => {
    const doc = { ...baseTemplate(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    expect(() => parseTemplate(doc)).toThrow(/newer/);
  });

  it('rejects malformed elements', () => {
    const doc = {
      ...baseTemplate(),
      elements: [{ id: 'x', kind: 'field', scope: 'first' }]
    };
    expect(() => parseTemplate(doc)).toThrow();
  });

  it('rejects invalid colors', () => {
    const doc = {
      ...baseTemplate(),
      elements: [
        {
          id: 'x',
          kind: 'text',
          scope: 'first',
          frame: { x: 0, y: 0, width: 10, height: 10 },
          content: 'hola',
          style: { font: 'body', size: 10, color: 'red' }
        }
      ]
    };
    expect(() => parseTemplate(doc)).toThrow(/#rrggbb/);
  });
});

describe('createTemplate', () => {
  it('derives page size from docType and applies defaults', () => {
    const t = createTemplate({ id: 't1', name: 'Oficio', docType: 'oficio' });
    expect(t.pageSize).toEqual({ width: 612, height: 936 });
    expect(t.locale).toBe('es-MX');
    expect(t.fonts.map(f => f.family)).toEqual(['body', 'body-bold', 'body-italic']);
    // Wizard output must always survive parseTemplate.
    expect(() => parseTemplate(JSON.parse(JSON.stringify(t)))).not.toThrow();
  });

  it('requires explicit pageSize for custom docType', () => {
    expect(() => createTemplate({ id: 't2', name: 'X', docType: 'custom' })).toThrow();
    const t = createTemplate({
      id: 't3',
      name: 'X',
      docType: 'custom',
      pageSize: { width: 400, height: 400 }
    });
    expect(t.pageSize).toEqual({ width: 400, height: 400 });
  });
});
