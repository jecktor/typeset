import { describe, expect, it } from 'vitest';
import type { ModelDescriptor, Template } from '../src/core';
import { validateTemplate } from '../src/core';
import { baseTemplate, region, style } from './helpers';

const descriptor: ModelDescriptor = {
  name: 'cotizacion',
  label: 'Cotización',
  fields: [
    { kind: 'scalar', key: 'customerName', label: 'Cliente', type: 'string' },
    {
      kind: 'list',
      key: 'items',
      label: 'Partidas',
      itemFields: [
        { key: 'description', label: 'Descripción', type: 'string' },
        { key: 'total', label: 'Total', type: 'currency' }
      ]
    }
  ],
  sample: { customerName: 'ACME', items: [] }
};

function flowTemplate(overrides: Partial<Template> = {}): Template {
  return baseTemplate({
    flow: {
      regions: { first: region(), middle: region({ yTop: 60 }) },
      stack: [
        {
          id: 't1',
          kind: 'table',
          binding: 'items',
          columns: [
            { itemKey: 'description', label: 'Descripción', width: 'flex' },
            { itemKey: 'total', label: 'Total', width: 90, align: 'right' }
          ],
          header: { height: 22, repeatOnContinuation: true, style: style() },
          row: { minHeight: 22, padding: 6, style: style() }
        }
      ]
    },
    ...overrides
  });
}

describe('validateTemplate', () => {
  it('passes a well-formed flow template', () => {
    expect(validateTemplate(flowTemplate(), descriptor)).toEqual([]);
  });

  it('errors on undeclared fonts', () => {
    const t = flowTemplate({ fonts: [] });
    const issues = validateTemplate(t, descriptor);
    expect(issues.some(i => i.severity === 'error' && i.message.includes('fuente'.slice(1)))).toBe(true);
  });

  it('warns when a field binding is missing from the model', () => {
    const t = flowTemplate({
      elements: [
        {
          id: 'f1',
          kind: 'field',
          scope: 'first',
          binding: 'noExiste',
          frame: { x: 0, y: 0, width: 100, height: 12 },
          style: style()
        }
      ]
    });
    const issues = validateTemplate(t, descriptor);
    expect(issues.some(i => i.message.includes('noExiste'))).toBe(true);
  });

  it('warns when last-page elements are not bottom-anchored', () => {
    const t = flowTemplate({
      elements: [
        {
          id: 'l1',
          kind: 'text',
          scope: 'last',
          content: 'pie',
          frame: { x: 0, y: 700, width: 100, height: 12 },
          style: style()
        }
      ]
    });
    const issues = validateTemplate(t, descriptor);
    expect(issues.some(i => i.message.includes('última página'))).toBe(true);
  });

  it('errors when fixed columns exceed the region width', () => {
    const t = flowTemplate();
    const table = t.flow!.stack[0]!;
    if (table.kind === 'table') {
      table.columns = [{ itemKey: 'total', label: 'Total', width: 900 }];
    }
    const issues = validateTemplate(t, descriptor);
    expect(issues.some(i => i.severity === 'error' && i.message.includes('exceden'))).toBe(true);
  });

  it('errors on zero-height regions and warns on width mismatch', () => {
    const t = flowTemplate();
    t.flow!.regions.first = region({ yTop: 500, yBottom: 400 });
    t.flow!.regions.middle = region({ width: 300 });
    const issues = validateTemplate(t, descriptor);
    expect(issues.some(i => i.severity === 'error' && i.message.includes('altura'))).toBe(true);
    expect(issues.some(i => i.message.includes('distinto ancho'))).toBe(true);
  });

  it('warns when a column references a missing item field', () => {
    const t = flowTemplate();
    const table = t.flow!.stack[0]!;
    if (table.kind === 'table') {
      table.columns = [{ itemKey: 'nope', label: 'X', width: 'flex' }];
    }
    const issues = validateTemplate(t, descriptor);
    expect(issues.some(i => i.message.includes('nope'))).toBe(true);
  });
});
