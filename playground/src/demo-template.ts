/**
 * Demo cotización template for the playground. Everything here is fictional:
 * neutral letterhead/signature assets (generated), example names and terms.
 * Coordinates are PDF points, top-left origin, on a 612×792 carta page.
 */
import type { Template } from '../../src/core';

const TEXT = '#212121';
const MUTED = '#737373';
const HIGHLIGHT = '#6db521';
const HEADER_BG = '#f2f2f2';
const BORDER = '#d9d9d9';

const body = (size: number, overrides: Record<string, unknown> = {}) => ({
  font: 'body',
  size,
  color: TEXT,
  ...overrides
});

export const DEMO_SIGNATORY = 'Lic. Ana Martínez Ejemplo';

export const DEMO_DISCLAIMER =
  'Documento de demostración generado con Typeset. Los precios, términos y datos de contacto mostrados son ficticios y no constituyen una oferta comercial. La presente cotización de ejemplo tiene fines ilustrativos únicamente.';

export const demoTemplate: Template = {
  schemaVersion: 1,
  id: 'tpl-demo-cotizacion',
  name: 'Cotización de ejemplo',
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
    {
      id: 'cot-number',
      kind: 'field',
      scope: 'first',
      binding: 'cotizacionNumber',
      frame: { x: 356, y: 70, width: 200, height: 12 },
      style: body(10, { align: 'right' })
    },
    {
      id: 'cot-date',
      kind: 'field',
      scope: 'first',
      binding: 'date',
      format: { type: 'date', pattern: 'full' },
      frame: { x: 256, y: 91, width: 300, height: 13 },
      style: body(11, { align: 'right' })
    },
    {
      id: 'cliente-label',
      kind: 'text',
      scope: 'first',
      content: 'CLIENTE:',
      frame: { x: 56, y: 93, width: 60, height: 13 },
      style: body(11, { font: 'body-bold' })
    },
    {
      id: 'cliente-name',
      kind: 'field',
      scope: 'first',
      binding: 'customerName',
      frame: { x: 109.8, y: 93, width: 446, height: 13 },
      style: body(11)
    },
    {
      id: 'presente',
      kind: 'text',
      scope: 'first',
      content: 'PRESENTE',
      frame: { x: 56, y: 111, width: 200, height: 13 },
      style: body(11)
    },
    {
      id: 'signature',
      kind: 'image',
      scope: 'last',
      assetId: 'signature',
      fit: 'contain',
      frame: { x: 251, y: 115, width: 110, height: 40, anchor: 'bottom' }
    },
    {
      id: 'signatory',
      kind: 'text',
      scope: 'last',
      content: DEMO_SIGNATORY,
      frame: { x: 56, y: 123, width: 500, height: 13, anchor: 'bottom' },
      style: body(11, { align: 'center' })
    },
    {
      id: 'disclaimer',
      kind: 'text',
      scope: 'last',
      content: DEMO_DISCLAIMER,
      frame: { x: 56, y: 81.5, width: 500, height: 36, anchor: 'bottom' },
      style: body(8.5, { font: 'body-italic', color: MUTED, lineHeight: 12 / 8.5 })
    }
  ],
  flow: {
    regions: {
      first: { x: 56, yTop: 139, yBottom: 702, width: 500 },
      middle: { x: 56, yTop: 105, yBottom: 702, width: 500 }
    },
    stack: [
      {
        id: 'notas',
        kind: 'text-block',
        binding: 'notas',
        style: body(11, { lineHeight: 13 / 11 }),
        justify: true,
        spacingAfter: 17
      },
      {
        id: 'product-image',
        kind: 'image-block',
        binding: 'productImageUrl',
        maxHeight: 200,
        align: 'center',
        spacingAfter: 18
      },
      {
        id: 'items',
        kind: 'table',
        binding: 'items',
        columns: [
          { itemKey: 'photo', label: 'Foto', width: 54, align: 'center', kind: 'image', imageHeight: 36 },
          { itemKey: 'cantidad', label: 'Cantidad', width: 60, align: 'right' },
          { itemKey: 'description', label: 'Descripción', width: 'flex' },
          { itemKey: 'subtotal', label: 'Subtotal', width: 90, align: 'right', format: { type: 'currency' } },
          { itemKey: 'tax', label: 'Impuesto', width: 90, align: 'right', format: { type: 'currency' } },
          { itemKey: 'total', label: 'TOTAL', width: 100, align: 'right', format: { type: 'currency' }, style: body(10, { font: 'body-bold', color: HIGHLIGHT }) }
        ],
        header: {
          height: 22,
          repeatOnContinuation: true,
          style: body(10, { font: 'body-bold' }),
          background: HEADER_BG
        },
        row: {
          minHeight: 22,
          padding: 6,
          paddingY: 5,
          style: body(10),
          divider: { color: BORDER, thickness: 0.5 }
        },
        images: { enabled: true },
        footer: {
          rowGap: 16,
          rows: [
            { label: 'Subtotal', binding: 'totals.subtotal', format: { type: 'currency' }, labelStyle: body(10, { color: MUTED }), valueStyle: body(10) },
            { label: 'Impuesto', binding: 'totals.tax', format: { type: 'currency' }, labelStyle: body(10, { color: MUTED }), valueStyle: body(10) },
            { label: 'Total', binding: 'totals.total', format: { type: 'currency' }, labelStyle: body(12, { font: 'body-bold' }), valueStyle: body(13, { font: 'body-bold', color: HIGHLIGHT }) }
          ]
        }
      }
    ]
  }
};

export function demoSample() {
  const descriptions = [
    'Servicio profesional básico',
    'Producto con descripción extendida para mostrar cómo el texto salta de línea dentro de la celda de la tabla',
    'Instalación y configuración',
    'Mantenimiento mensual',
    'Capacitación del equipo (4 horas)',
    'Soporte prioritario',
    'Licencia anual',
    'Material adicional según especificación técnica aprobada por el cliente en la propuesta',
    'Transporte y logística',
    'Puesta en marcha',
    'Documentación técnica',
    'Garantía extendida',
    'Kit de accesorios',
    'Revisión final y entrega'
  ];
  const items = descriptions.map((description, i) => {
    const subtotal = 1850 + i * 745.5;
    const tax = subtotal * 0.16;
    return {
      // Every third item has no photo, so the fallback shows up in preview.
      photo: i % 3 === 2 ? '' : i % 2 === 0 ? 'product-a' : 'product-b',
      cantidad: (i % 4) + 1,
      description,
      subtotal,
      tax,
      total: subtotal + tax
    };
  });
  const subtotal = items.reduce((a, it) => a + it.subtotal, 0);
  const tax = items.reduce((a, it) => a + it.tax, 0);
  return {
    cotizacionNumber: 'COT-20260001',
    date: new Date(2026, 6, 31),
    customerName: 'Cliente de Ejemplo SA de CV',
    taxPercentage: 16,
    items,
    totals: { subtotal, tax, total: subtotal + tax },
    notas:
      'Cotización de demostración generada con Typeset. Este párrafo muestra cómo un bloque de texto se acomoda y justifica dentro del área de contenido.\nUn segundo párrafo demuestra la separación entre párrafos.'
  };
}
