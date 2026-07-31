import { describe, expect, it } from 'vitest';
import { planLayout } from '../src/render/layout';
import type { TableFlowItem, Template, TemplateElement } from '../src/core';
import { baseTemplate, fakeMeasure, items, region, style } from './helpers';

const table = (overrides: Partial<TableFlowItem> = {}): TableFlowItem => ({
  id: 'items-table',
  kind: 'table',
  binding: 'items',
  columns: [
    { itemKey: 'cantidad', label: 'Cantidad', width: 60, align: 'right' },
    { itemKey: 'description', label: 'Descripción', width: 'flex' },
    { itemKey: 'total', label: 'TOTAL', width: 100, align: 'right', format: { type: 'currency' } }
  ],
  header: { height: 22, repeatOnContinuation: true, style: style({ font: 'body-bold' }), background: '#f2f2f2' },
  row: { minHeight: 22, padding: 6, style: style() },
  ...overrides
});

function flowTemplate(stack: TableFlowItem[], elements: TemplateElement[] = []): Template {
  return baseTemplate({
    elements,
    flow: {
      regions: { first: region(), middle: region({ yTop: 60 }) },
      stack
    }
  });
}

const plan = (template: Template, data: Record<string, unknown>) =>
  planLayout({ template, data, measure: fakeMeasure, images: new Map() });

describe('planLayout — flow tables', () => {
  it('keeps a short table on a single page', () => {
    const result = plan(flowTemplate([table()]), { items: items(3) });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]!.kind).toBe('first');
    expect(result.warnings).toEqual([]);
  });

  it('overflows long tables onto middle pages and repeats the header', () => {
    const result = plan(flowTemplate([table()]), { items: items(60) });
    expect(result.pages.length).toBeGreaterThan(1);
    expect(result.pages[1]!.kind).toBe('middle');

    // Repeated header: continuation page contains the header labels again.
    const headerTexts = result.pages[1]!.ops.filter(
      op => op.op === 'text' && op.text === 'Descripción'
    );
    expect(headerTexts).toHaveLength(1);
  });

  it('does not repeat the header when repeatOnContinuation is false', () => {
    const t = table();
    t.header = { ...t.header, repeatOnContinuation: false };
    const result = plan(flowTemplate([t]), { items: items(60) });
    expect(result.pages.length).toBeGreaterThan(1);
    const headerTexts = result.pages[1]!.ops.filter(
      op => op.op === 'text' && op.text === 'Descripción'
    );
    expect(headerTexts).toHaveLength(0);
  });

  it('keeps totals footer together (moves it whole to the next page)', () => {
    const withFooter = table({
      footer: {
        rows: [
          { label: 'Subtotal', binding: 'totals.subtotal', format: { type: 'currency' }, labelStyle: style(), valueStyle: style() },
          { label: 'Total', binding: 'totals.total', format: { type: 'currency' }, labelStyle: style({ font: 'body-bold' }), valueStyle: style({ font: 'body-bold' }) }
        ]
      }
    });
    // Find an item count where rows fit but the footer must break.
    for (let n = 20; n < 40; n++) {
      const result = plan(flowTemplate([withFooter]), {
        items: items(n),
        totals: { subtotal: 1, total: 2 }
      });
      const lastPage = result.pages[result.pages.length - 1]!;
      const totalOps = lastPage.ops.filter(op => op.op === 'text' && op.text === 'Total');
      const subtotalOps = lastPage.ops.filter(op => op.op === 'text' && op.text === 'Subtotal');
      // Wherever the footer lands, both of its rows land together.
      expect(totalOps.length).toBe(subtotalOps.length);
    }
  });

  it('wraps long descriptions and grows the row height', () => {
    const longDesc =
      'Suministro e instalación de estructura metálica para stand de exposición con iluminación LED y gráficos impresos en gran formato';
    const result = plan(flowTemplate([table()]), {
      items: [{ cantidad: 1, description: longDesc, subtotal: 1, tax: 1, total: 1 }]
    });
    const texts = result.pages[0]!.ops.filter(op => op.op === 'text');
    const descLines = texts.filter(
      op => op.op === 'text' && longDesc.includes(op.text) && op.text !== longDesc
    );
    expect(descLines.length).toBeGreaterThan(1);
  });

  it('warns and skips when the table binding is not an array', () => {
    const result = plan(flowTemplate([table()]), { items: 'nope' });
    expect(result.warnings.some(w => w.includes('not an array'))).toBe(true);
    expect(result.pages).toHaveLength(1);
  });
});

describe('planLayout — last-page resolution', () => {
  const lastBlock: TemplateElement = {
    id: 'terms',
    kind: 'text',
    scope: 'last',
    frame: { x: 56, y: 85, width: 500, height: 120, anchor: 'bottom' },
    content: 'Términos y condiciones',
    style: style()
  };

  it('stamps last-scope elements on the final flow page when they fit', () => {
    const result = plan(flowTemplate([table()], [lastBlock]), { items: items(2) });
    expect(result.pages).toHaveLength(1);
    const texts = result.pages[0]!.ops.filter(
      op => op.op === 'text' && op.text.includes('Términos')
    );
    expect(texts).toHaveLength(1);
  });

  it('appends a dedicated last page when the flow collides with the last block', () => {
    // Fill the page almost exactly to the bottom so the last block cannot fit.
    const template = flowTemplate([table()], [lastBlock]);
    template.flow!.regions.first = region({ yBottom: 730 });
    template.flow!.regions.middle = region({ yTop: 60, yBottom: 730 });

    let appended = false;
    for (let n = 25; n < 45 && !appended; n++) {
      const result = plan(template, { items: items(n) });
      const lastPage = result.pages[result.pages.length - 1]!;
      if (lastPage.kind === 'last') {
        appended = true;
        // Dedicated last page has the last-scope content and no table rows.
        expect(lastPage.ops.some(op => op.op === 'text' && op.text.includes('Términos'))).toBe(true);
      }
    }
    expect(appended).toBe(true);
  });
});

describe('planLayout — static templates and scopes', () => {
  it('renders a single page combining first and last scopes without flow', () => {
    const template = baseTemplate({
      elements: [
        { id: 'a', kind: 'text', scope: 'first', frame: { x: 0, y: 10, width: 200, height: 20 }, content: 'primera', style: style() },
        { id: 'b', kind: 'text', scope: 'last', frame: { x: 0, y: 40, width: 200, height: 20 }, content: 'última', style: style() },
        { id: 'c', kind: 'text', scope: 'middle', frame: { x: 0, y: 70, width: 200, height: 20 }, content: 'media', style: style() }
      ]
    });
    const result = plan(template, {});
    expect(result.pages).toHaveLength(1);
    const texts = result.pages[0]!.ops.filter(op => op.op === 'text').map(op => (op as { text: string }).text);
    expect(texts).toContain('primera');
    expect(texts).toContain('última');
    expect(texts).not.toContain('media');
  });

  it('stamps middle+all elements on continuation pages only', () => {
    const template = flowTemplate([table()], [
      { id: 'folio', kind: 'field', scope: 'all', frame: { x: 400, y: 20, width: 150, height: 14 }, binding: 'folio', style: style({ align: 'right' }) },
      { id: 'cont', kind: 'text', scope: 'middle', frame: { x: 56, y: 20, width: 200, height: 14 }, content: 'continuación', style: style() }
    ]);
    const result = plan(template, { items: items(60), folio: 'COT-20260001' });
    expect(result.pages.length).toBeGreaterThan(1);

    const textsOn = (i: number) =>
      result.pages[i]!.ops.filter(op => op.op === 'text').map(op => (op as { text: string }).text);
    expect(textsOn(0)).toContain('COT-20260001');
    expect(textsOn(0)).not.toContain('continuación');
    expect(textsOn(1)).toContain('COT-20260001');
    expect(textsOn(1)).toContain('continuación');
  });

  it('anchors bottom-anchored frames from the page bottom edge', () => {
    const template = baseTemplate({
      elements: [
        { id: 'foot', kind: 'text', scope: 'first', frame: { x: 0, y: 85, width: 300, height: 12, anchor: 'bottom' }, content: 'pie', style: style() }
      ]
    });
    const result = plan(template, {});
    const op = result.pages[0]!.ops.find(o => o.op === 'text')!;
    // top = 792 - 85 - 12 = 695 → baseline = 695 + size(10) = 705
    expect((op as { y: number }).y).toBe(705);
  });
});
