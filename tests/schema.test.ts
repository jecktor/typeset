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

  it('round-trips margins and keeps them optional', () => {
    const template = {
      ...baseTemplate(),
      margins: { top: 71, right: 71, bottom: 85, left: 71 }
    };
    const parsed = parseTemplate(JSON.parse(JSON.stringify(template)));
    expect(parsed.margins).toEqual(template.margins);
    // Pre-margins documents must keep parsing untouched.
    expect(parseTemplate(JSON.parse(JSON.stringify(baseTemplate()))).margins).toBeUndefined();
  });

  it('rejects negative margins', () => {
    const doc = {
      ...baseTemplate(),
      margins: { top: -1, right: 0, bottom: 0, left: 0 }
    };
    expect(() => parseTemplate(doc)).toThrow();
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

describe('parseTemplate — table images', () => {
  const tableWith = (extra: Record<string, unknown>) => ({
    ...baseTemplate(),
    flow: {
      regions: {
        first: { x: 56, yTop: 104, yBottom: 702, width: 500 },
        middle: { x: 56, yTop: 60, yBottom: 702, width: 500 }
      },
      stack: [
        {
          id: 'items',
          kind: 'table',
          binding: 'items',
          columns: [
            { itemKey: 'photo', label: 'Foto', width: 54, kind: 'image', imageHeight: 36 },
            { itemKey: 'description', label: 'Descripción', width: 'flex' }
          ],
          header: {
            height: 22,
            repeatOnContinuation: true,
            style: { font: 'body', size: 10, color: '#222222' }
          },
          row: {
            minHeight: 22,
            padding: 6,
            style: { font: 'body', size: 10, color: '#222222' }
          },
          ...extra
        }
      ]
    }
  });

  it('round-trips image columns and the images switch', () => {
    const doc = tableWith({ images: { enabled: true, fallbackAssetId: 'asset-1' } });
    const parsed = parseTemplate(JSON.parse(JSON.stringify(doc)));
    const table = parsed.flow!.stack[0]!;
    expect(table.kind).toBe('table');
    if (table.kind !== 'table') return;
    expect(table.columns[0]).toMatchObject({ kind: 'image', imageHeight: 36 });
    expect(table.images).toEqual({ enabled: true, fallbackAssetId: 'asset-1' });
  });

  it('keeps pre-images tables parsing untouched', () => {
    const parsed = parseTemplate(JSON.parse(JSON.stringify(tableWith({}))));
    const table = parsed.flow!.stack[0]!;
    if (table.kind !== 'table') throw new Error('expected a table');
    expect(table.images).toBeUndefined();
  });

  it('rejects an unknown column kind', () => {
    const doc = tableWith({});
    (doc.flow.stack[0]!.columns[0] as Record<string, unknown>).kind = 'video';
    expect(() => parseTemplate(doc)).toThrow();
  });
});
