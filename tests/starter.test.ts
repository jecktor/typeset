import { describe, expect, it } from 'vitest';
import {
  applyStarterLayout,
  createStarterTemplate,
  createTemplate,
  parseTemplate,
  starterTemplateName,
  validateTemplate,
  type ModelDescriptor
} from '../src/core';

const cotizacion: ModelDescriptor = {
  name: 'cotizacion',
  label: 'Cotización',
  fields: [
    { kind: 'scalar', key: 'folio', label: 'Folio', type: 'string' },
    { kind: 'scalar', key: 'date', label: 'Fecha', type: 'date', format: 'long' },
    { kind: 'scalar', key: 'customer.name', label: 'Cliente', type: 'string' },
    { kind: 'scalar', key: 'totals.total', label: 'Total', type: 'currency' },
    {
      kind: 'list',
      key: 'items',
      label: 'Partidas',
      itemFields: [
        { key: 'description', label: 'Descripción', type: 'string' },
        { key: 'qty', label: 'Cantidad', type: 'number' },
        { key: 'total', label: 'Total', type: 'currency' }
      ]
    }
  ],
  sample: {}
};

describe('starterTemplateName', () => {
  // The name is what people read in the list, so it comes from the model's
  // human label — never from its machine `name` ('quote', 'remissionNote').
  it('uses the model label, not its identifier', () => {
    expect(starterTemplateName(cotizacion)).toBe('Cotización');
    expect(
      starterTemplateName({
        ...cotizacion,
        name: 'remissionNote',
        label: 'Nota de remisión'
      })
    ).toBe('Nota de remisión');
  });

  it('falls back when there is no model or the label is blank', () => {
    expect(starterTemplateName(undefined)).toBe('Plantilla base');
    expect(starterTemplateName({ ...cotizacion, label: '   ' })).toBe(
      'Plantilla base'
    );
  });
});

// The editor's blank-page action runs this against a template that already
// exists, so it must fill the layout without touching the record's identity.
describe('applyStarterLayout', () => {
  it('keeps id, name and model while replacing the layout', () => {
    const existing = createTemplate({
      id: 'tpl-existing',
      name: 'Mi cotización de siempre',
      docType: 'oficio',
      model: 'cotizacion'
    });
    const filled = applyStarterLayout(existing, cotizacion);

    expect(filled.id).toBe('tpl-existing');
    expect(filled.name).toBe('Mi cotización de siempre');
    expect(filled.model).toBe('cotizacion');
    expect(filled.docType).toBe('oficio');
    expect(filled.pageSize).toEqual(existing.pageSize);
    expect(filled.elements.length).toBeGreaterThan(0);
    expect(filled.flow?.stack.length).toBeGreaterThan(0);
    expect(validateTemplate(filled, cotizacion)).toEqual([]);
  });

  it('does not mutate the template it is given', () => {
    const existing = createTemplate({
      id: 'tpl-frozen',
      name: 'Vacía',
      docType: 'carta'
    });
    applyStarterLayout(existing, cotizacion);
    expect(existing.elements).toEqual([]);
    expect(existing.flow).toBeUndefined();
    expect(existing.margins).toBeUndefined();
  });

  it('replaces a previous layout instead of appending to it', () => {
    const once = applyStarterLayout(
      createTemplate({ id: 'tpl-twice', name: 'X', docType: 'carta' }),
      cotizacion
    );
    const twice = applyStarterLayout(once, cotizacion);
    expect(twice.elements).toHaveLength(once.elements.length);
    expect(twice.flow?.stack).toHaveLength(once.flow!.stack.length);
  });
});

describe('createStarterTemplate', () => {
  const t = createStarterTemplate({
    id: 'tpl-1',
    docType: 'carta',
    descriptor: cotizacion
  });

  it('names itself readably and keeps the model as its stable identity', () => {
    expect(t.name).toBe('Cotización');
    expect(t.model).toBe('cotizacion');
  });

  it('places every scalar field with its label and format', () => {
    const bindings = t.elements
      .filter(el => el.kind === 'field')
      .map(el => (el.kind === 'field' ? el.binding : ''));
    expect(bindings).toEqual(['folio', 'date', 'customer.name', 'totals.total']);

    const labels = t.elements
      .filter(el => el.kind === 'text')
      .map(el => (el.kind === 'text' ? el.content : ''));
    // Title + one label per scalar.
    expect(labels).toEqual([
      'Cotización',
      'Folio:',
      'Fecha:',
      'Cliente:',
      'Total:'
    ]);

    const dateField = t.elements.find(
      el => el.kind === 'field' && el.binding === 'date'
    );
    expect(dateField?.kind === 'field' && dateField.format).toEqual({
      type: 'date',
      pattern: 'long'
    });
  });

  it('builds a table per list field with one column per item field', () => {
    expect(t.flow?.stack).toHaveLength(1);
    const table = t.flow!.stack[0]!;
    expect(table.kind).toBe('table');
    if (table.kind !== 'table') return;
    expect(table.binding).toBe('items');
    // Line-item reading order, whatever order the model declared: how many,
    // what it is, what it costs.
    expect(table.columns.map(c => c.itemKey)).toEqual([
      'qty',
      'description',
      'total'
    ]);
    // Numbers and money right-aligned, free text flexes.
    expect(table.columns.map(c => c.align)).toEqual(['right', 'left', 'right']);
    expect(table.columns[1]!.width).toBe('flex');
  });

  it('sets margins that match the content region', () => {
    expect(t.margins).toEqual({ top: 56, right: 56, bottom: 56, left: 56 });
    const { first } = t.flow!.regions;
    expect(first.x).toBe(56);
    expect(first.x + first.width).toBe(t.pageSize.width - 56);
    expect(first.yBottom).toBe(t.pageSize.height - 56);
  });

  // The module refuses to save a template with validation errors, so a
  // generated starter that can't be saved would be worse than no starter.
  it('is free of validation errors AND warnings against its model', () => {
    expect(validateTemplate(t, cotizacion)).toEqual([]);
  });

  it('survives a JSON round-trip through parseTemplate', () => {
    expect(() => parseTemplate(JSON.parse(JSON.stringify(t)))).not.toThrow();
  });

  it('falls back to a text block when the model has no list', () => {
    const noList = createStarterTemplate({
      id: 'tpl-2',
      docType: 'carta',
      descriptor: { ...cotizacion, fields: cotizacion.fields.slice(0, 2) }
    });
    expect(noList.flow?.stack[0]?.kind).toBe('text-block');
    expect(validateTemplate(noList, cotizacion)).toEqual([]);
  });

  // A long string can't fit a fixed header slot: it would render on top of
  // whatever sits below it, which is exactly what a starter must not do.
  it('routes long free text to the flow instead of the header grid', () => {
    const withNotes: ModelDescriptor = {
      ...cotizacion,
      fields: [
        ...cotizacion.fields,
        { kind: 'scalar', key: 'notes', label: 'Notas', type: 'string' }
      ],
      sample: { notes: 'x'.repeat(200) }
    };
    const withLong = createStarterTemplate({
      id: 'tpl-5',
      docType: 'carta',
      descriptor: withNotes
    });

    const bindings = withLong.elements
      .filter(el => el.kind === 'field')
      .map(el => (el.kind === 'field' ? el.binding : ''));
    expect(bindings).not.toContain('notes');

    const block = withLong.flow!.stack.find(i => i.kind === 'text-block');
    expect(block?.kind === 'text-block' && block.content).toBe(
      'Notas: {{notes}}'
    );
    // Short strings stay in the header even when a long one exists.
    expect(bindings).toContain('customer.name');
  });

  it('gives every header slot room for a full line of text', () => {
    for (const el of t.elements) {
      if (el.kind === 'text' || el.kind === 'field') {
        const lineHeight = el.style.size * (el.style.lineHeight ?? 1.3);
        expect(el.frame.height).toBeGreaterThanOrEqual(lineHeight);
      }
    }
  });

  it('works with no descriptor at all', () => {
    const bare = createStarterTemplate({ id: 'tpl-3', docType: 'carta' });
    expect(bare.name).toBe('Plantilla base');
    expect(bare.model).toBeUndefined();
    expect(bare.elements.filter(el => el.kind === 'field')).toHaveLength(0);
    expect(validateTemplate(bare)).toEqual([]);
  });

  it('keeps the content region positive on a short custom page', () => {
    const short = createStarterTemplate({
      id: 'tpl-4',
      docType: 'custom',
      pageSize: { width: 400, height: 260 },
      descriptor: cotizacion
    });
    const { first, middle } = short.flow!.regions;
    expect(first.yBottom).toBeGreaterThan(first.yTop);
    expect(middle.yBottom).toBeGreaterThan(middle.yTop);
    expect(validateTemplate(short, cotizacion).filter(i => i.severity === 'error')).toEqual([]);
  });
});

describe('createStarterTemplate — product images', () => {
  const withPhotos: ModelDescriptor = {
    ...cotizacion,
    fields: cotizacion.fields.map(f =>
      f.kind === 'list'
        ? {
            ...f,
            itemFields: [
              { key: 'photo', label: 'Foto', type: 'image-url' as const },
              ...f.itemFields
            ]
          }
        : f
    )
  };

  it('orders columns foto, cantidad, descripción, total', () => {
    // Declared in a deliberately scrambled order.
    const scrambled: ModelDescriptor = {
      ...cotizacion,
      fields: cotizacion.fields.map(f =>
        f.kind === 'list'
          ? {
              ...f,
              itemFields: [
                { key: 'total', label: 'Total', type: 'currency' as const },
                { key: 'description', label: 'Descripción', type: 'string' as const },
                { key: 'photo', label: 'Foto', type: 'image-url' as const },
                { key: 'qty', label: 'Cantidad', type: 'number' as const }
              ]
            }
          : f
      )
    };
    const template = createStarterTemplate({
      id: 'tpl-order',
      docType: 'carta',
      descriptor: scrambled
    });
    const table = template.flow!.stack.find(i => i.kind === 'table')!;
    expect(table.columns.map(c => c.itemKey)).toEqual([
      'photo',
      'qty',
      'description',
      'total'
    ]);
  });

  it('keeps the declared order among fields of the same type', () => {
    const twoMoneyFields: ModelDescriptor = {
      ...cotizacion,
      fields: cotizacion.fields.map(f =>
        f.kind === 'list'
          ? {
              ...f,
              itemFields: [
                { key: 'subtotal', label: 'Subtotal', type: 'currency' as const },
                { key: 'tax', label: 'Impuesto', type: 'currency' as const },
                { key: 'total', label: 'Total', type: 'currency' as const }
              ]
            }
          : f
      )
    };
    const template = createStarterTemplate({
      id: 'tpl-money',
      docType: 'carta',
      descriptor: twoMoneyFields
    });
    const table = template.flow!.stack.find(i => i.kind === 'table')!;
    expect(table.columns.map(c => c.itemKey)).toEqual(['subtotal', 'tax', 'total']);
  });

  it('turns a picture field into an image column, images on', () => {
    const template = createStarterTemplate({
      id: 'tpl-img',
      docType: 'carta',
      descriptor: withPhotos
    });
    const table = template.flow!.stack.find(i => i.kind === 'table')!;
    const photo = table.columns[0]!;
    expect(photo).toMatchObject({ itemKey: 'photo', kind: 'image', align: 'center' });
    expect(photo.format).toBeUndefined();
    expect(table.images).toEqual({ enabled: true });
    expect(validateTemplate(template, withPhotos).filter(i => i.severity === 'error')).toEqual([]);
  });

  it('leaves images unconfigured for models without pictures', () => {
    const template = createStarterTemplate({
      id: 'tpl-plain',
      docType: 'carta',
      descriptor: cotizacion
    });
    const table = template.flow!.stack.find(i => i.kind === 'table')!;
    expect(table.images).toBeUndefined();
    expect(table.columns.every(c => c.kind === undefined)).toBe(true);
  });
});
