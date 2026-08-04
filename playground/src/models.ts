/**
 * Three models mirroring how the real apps declare theirs (facturalandia has
 * quote / remissionNote / invoice). Having more than one — and with different
 * field shapes — is what makes the starter generator and the model picker
 * actually testable here.
 */
import type { ModelDescriptor } from '../../src/core';
import { demoSample } from './demo-template';

const sample = demoSample() as unknown as Record<string, unknown>;

const itemFields = [
  { key: 'cantidad', label: 'Cantidad', type: 'number' as const },
  { key: 'description', label: 'Descripción', type: 'string' as const },
  { key: 'subtotal', label: 'Subtotal', type: 'currency' as const },
  { key: 'tax', label: 'Impuesto', type: 'currency' as const },
  { key: 'total', label: 'Total', type: 'currency' as const }
];

export const cotizacionModel: ModelDescriptor = {
  name: 'cotizacion',
  label: 'Cotización',
  fields: [
    { kind: 'scalar', key: 'cotizacionNumber', label: 'Número', type: 'string' },
    { kind: 'scalar', key: 'date', label: 'Fecha', type: 'date', format: 'full' },
    { kind: 'scalar', key: 'customerName', label: 'Cliente', type: 'string' },
    { kind: 'scalar', key: 'notas', label: 'Notas', type: 'string' },
    { kind: 'scalar', key: 'totals.subtotal', label: 'Subtotal', type: 'currency' },
    { kind: 'scalar', key: 'totals.tax', label: 'Impuesto', type: 'currency' },
    { kind: 'scalar', key: 'totals.total', label: 'Total', type: 'currency' },
    { kind: 'list', key: 'items', label: 'Partidas', itemFields }
  ],
  sample
};

/** No money anywhere — exercises a starter with no currency fields. */
export const remisionModel: ModelDescriptor = {
  name: 'remision',
  label: 'Nota de remisión',
  fields: [
    { kind: 'scalar', key: 'cotizacionNumber', label: 'Folio', type: 'string' },
    { kind: 'scalar', key: 'date', label: 'Fecha de entrega', type: 'date', format: 'long' },
    { kind: 'scalar', key: 'customerName', label: 'Recibe', type: 'string' },
    { kind: 'scalar', key: 'notas', label: 'Observaciones', type: 'string' },
    {
      kind: 'list',
      key: 'items',
      label: 'Mercancía',
      itemFields: itemFields.slice(0, 2)
    }
  ],
  sample
};

/** The widest model — checks the header grid with many fields. */
export const facturaModel: ModelDescriptor = {
  name: 'factura',
  label: 'Factura (CFDI)',
  fields: [
    { kind: 'scalar', key: 'uuid', label: 'Folio fiscal', type: 'string' },
    ...cotizacionModel.fields,
    { kind: 'scalar', key: 'paymentForm', label: 'Forma de pago', type: 'string' },
    { kind: 'scalar', key: 'paymentMethod', label: 'Método de pago', type: 'string' }
  ],
  sample: {
    ...sample,
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeffff0000',
    paymentForm: '03 Transferencia electrónica',
    paymentMethod: 'PUE'
  }
};

export const MODELS: ModelDescriptor[] = [
  cotizacionModel,
  remisionModel,
  facturaModel
];
