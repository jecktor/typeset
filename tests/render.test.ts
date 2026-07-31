import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { Template } from '../src/core';
import { renderPdf } from '../src/render';
import { items, style } from './helpers';

/** Build a fake letterhead background PDF (logo mark + footer band). */
async function makeLetterhead(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  page.drawText('TYPESET DEMO', { x: 56, y: 742, size: 20, font, color: rgb(0.43, 0.71, 0.13) });
  page.drawText('COTIZACIÓN', { x: 56, y: 720, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 40, color: rgb(0.93, 0.93, 0.93) });
  return doc.save();
}

/** A cotización-shaped template exercising background, flow and last-page logic. */
const cotizacionTemplate: Template = {
  schemaVersion: 1,
  id: 'tpl-cotizacion',
  name: 'Cotización',
  docType: 'carta',
  pageSize: { width: 612, height: 792 },
  locale: 'es-MX',
  model: 'cotizacion',
  fonts: [
    { family: 'body', source: { kind: 'standard', name: 'Helvetica' } },
    { family: 'body-bold', source: { kind: 'standard', name: 'Helvetica-Bold' } },
    { family: 'body-italic', source: { kind: 'standard', name: 'Helvetica-Oblique' } }
  ],
  background: { first: { assetId: 'letterhead', pageIndex: 0 } },
  elements: [
    { id: 'cot-number', kind: 'field', scope: 'first', binding: 'cotizacionNumber', frame: { x: 356, y: 70, width: 200, height: 12 }, style: style({ align: 'right' }) },
    { id: 'cot-date', kind: 'field', scope: 'first', binding: 'date', format: { type: 'date', pattern: 'full' }, frame: { x: 256, y: 90, width: 300, height: 13 }, style: style({ size: 11, align: 'right' }) },
    { id: 'cliente-label', kind: 'text', scope: 'first', content: 'CLIENTE: {{customerName}}', frame: { x: 56, y: 120, width: 400, height: 14 }, style: style({ size: 11, font: 'body-bold' }) },
    { id: 'presente', kind: 'text', scope: 'first', content: 'PRESENTE', frame: { x: 56, y: 138, width: 200, height: 14 }, style: style({ size: 11 }) },
    { id: 'disclaimer', kind: 'text', scope: 'last', content: 'Los costos son más IVA. La presente cotización tiene una vigencia de 1 mes. Se requieren 2 días de instalación.', frame: { x: 56, y: 60, width: 500, height: 40, anchor: 'bottom' }, style: style({ size: 8.5, font: 'body-italic', color: '#737373' }) }
  ],
  flow: {
    regions: {
      first: { x: 56, yTop: 170, yBottom: 690, width: 500 },
      middle: { x: 56, yTop: 105, yBottom: 690, width: 500 }
    },
    stack: [
      { id: 'notas', kind: 'text-block', binding: 'notas', style: style({ size: 11 }), justify: true, spacingAfter: 6 },
      {
        id: 'items',
        kind: 'table',
        binding: 'items',
        columns: [
          { itemKey: 'cantidad', label: 'Cantidad', width: 60, align: 'right' },
          { itemKey: 'description', label: 'Descripción', width: 'flex' },
          { itemKey: 'subtotal', label: 'Subtotal', width: 90, align: 'right', format: { type: 'currency' } },
          { itemKey: 'tax', label: 'Impuesto', width: 90, align: 'right', format: { type: 'currency' } },
          { itemKey: 'total', label: 'TOTAL', width: 100, align: 'right', format: { type: 'currency' }, style: style({ font: 'body-bold', color: '#6eb521' }) }
        ],
        header: { height: 22, repeatOnContinuation: true, style: style({ font: 'body-bold' }), background: '#f2f2f2' },
        row: { minHeight: 22, padding: 6, style: style(), divider: { color: '#d9d9d9', thickness: 0.5 } },
        footer: {
          rows: [
            { label: 'Subtotal', binding: 'totals.subtotal', format: { type: 'currency' }, labelStyle: style({ color: '#737373' }), valueStyle: style() },
            { label: 'Impuesto', binding: 'totals.tax', format: { type: 'currency' }, labelStyle: style({ color: '#737373' }), valueStyle: style() },
            { label: 'Total', binding: 'totals.total', format: { type: 'currency' }, labelStyle: style({ size: 12, font: 'body-bold' }), valueStyle: style({ size: 13, font: 'body-bold', color: '#6eb521' }) }
          ]
        }
      }
    ]
  }
};

const data = {
  cotizacionNumber: 'COT-20260031',
  date: new Date(2026, 6, 29),
  customerName: 'Constructora Del Norte SA de CV',
  notas:
    'Suministro e instalación de stand para exposición según diseño aprobado. Incluye estructura, iluminación y gráficos en gran formato.\nEl montaje se realiza un día antes del evento.',
  items: items(40, 'Panel modular con impresión'),
  totals: { subtotal: 82000, tax: 13120, total: 95120 }
};

describe('renderPdf (integration)', () => {
  it('renders a multi-page cotización over a background letterhead', async () => {
    const letterhead = await makeLetterhead();
    const warnings: string[] = [];

    const bytes = await renderPdf({
      template: cotizacionTemplate,
      data,
      assets: { letterhead },
      onWarning: w => warnings.push(w)
    });

    const outDir = path.join(__dirname, '__output__');
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, 'cotizacion.pdf'), bytes);

    const result = await PDFDocument.load(bytes);
    expect(result.getPageCount()).toBeGreaterThan(1);
    // Every page inherits the letterhead's page size.
    for (const page of result.getPages()) {
      expect(page.getSize()).toEqual({ width: 612, height: 792 });
    }
    expect(warnings).toEqual([]);
  });

  it('renders a template with no background or flow (plain stamping)', async () => {
    const template: Template = {
      ...cotizacionTemplate,
      background: undefined,
      flow: undefined,
      elements: cotizacionTemplate.elements
    };
    const bytes = await renderPdf({ template, data });
    const result = await PDFDocument.load(bytes);
    expect(result.getPageCount()).toBe(1);
  });

  it('fails loud on an undeclared font family', async () => {
    const template: Template = {
      ...cotizacionTemplate,
      background: undefined,
      flow: undefined,
      fonts: [{ family: 'body', source: { kind: 'standard', name: 'Helvetica' } }]
    };
    await expect(renderPdf({ template, data })).rejects.toThrow(/font family/i);
  });

  it('embeds url-bound images via the injected fetcher', async () => {
    // 1×1 red PNG.
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x99, 0x0c, 0x1a, 0x0a, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
    ]);
    const template: Template = {
      ...cotizacionTemplate,
      background: undefined,
      flow: undefined,
      elements: [
        {
          id: 'product',
          kind: 'image',
          scope: 'first',
          binding: 'productImageUrl',
          fit: 'contain',
          frame: { x: 100, y: 100, width: 120, height: 80 }
        }
      ]
    };
    const warnings: string[] = [];
    const fetched: string[] = [];
    const bytes = await renderPdf({
      template,
      data: { ...data, productImageUrl: 'https://example.com/p.png' },
      fetchImage: async url => {
        fetched.push(url);
        return png;
      },
      onWarning: w => warnings.push(w)
    });
    expect(fetched).toEqual(['https://example.com/p.png']);
    expect(warnings).toEqual([]);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('requires fontkit for asset fonts', async () => {
    const template: Template = {
      ...cotizacionTemplate,
      background: undefined,
      flow: undefined,
      fonts: [{ family: 'body', source: { kind: 'asset', assetId: 'font-1' } }]
    };
    await expect(
      renderPdf({ template, data, assets: { 'font-1': new Uint8Array([1]) } })
    ).rejects.toThrow(/fontkit/);
  });
});
