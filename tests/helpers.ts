import type {
  FlowRegion,
  FontMetrics,
  MeasureProvider,
  TextStyle,
  Template
} from '../src/core';

/** Deterministic fake metrics: every glyph is 0.5em wide. */
export const fakeFont: FontMetrics = {
  widthOfTextAtSize: (text, size) => text.length * size * 0.5
};

export const fakeMeasure: MeasureProvider = () => fakeFont;

export const style = (overrides: Partial<TextStyle> = {}): TextStyle => ({
  font: 'body',
  size: 10,
  color: '#222222',
  ...overrides
});

export const region = (overrides: Partial<FlowRegion> = {}): FlowRegion => ({
  x: 56,
  yTop: 104,
  yBottom: 702,
  width: 500,
  ...overrides
});

export function baseTemplate(overrides: Partial<Template> = {}): Template {
  return {
    schemaVersion: 1,
    id: 'tpl-test',
    name: 'Test template',
    docType: 'carta',
    pageSize: { width: 612, height: 792 },
    locale: 'es-MX',
    fonts: [
      { family: 'body', source: { kind: 'standard', name: 'Helvetica' } },
      { family: 'body-bold', source: { kind: 'standard', name: 'Helvetica-Bold' } }
    ],
    elements: [],
    ...overrides
  };
}

export function items(count: number, description = 'Producto de prueba') {
  return Array.from({ length: count }, (_, i) => ({
    cantidad: i + 1,
    description: `${description} ${i + 1}`,
    subtotal: 100 * (i + 1),
    tax: 16 * (i + 1),
    total: 116 * (i + 1)
  }));
}
