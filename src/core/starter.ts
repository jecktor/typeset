/**
 * Starter templates: a ready-to-use layout generated from a ModelDescriptor,
 * so a freshly installed templates module is never a blank page. Pure data —
 * no React, no pdf-lib — so hosts can also seed it from a backend script.
 */
import { newElementId, newFlowId } from './ids';
import {
  getByPath,
  type ListFieldDescriptor,
  type ModelDescriptor,
  type ScalarFieldDescriptor
} from './model';
import { createTemplate } from './schema';
import type {
  FlowItem,
  ScalarType,
  TableColumn,
  TableFlowItem,
  Template,
  TemplateElement,
  TextStyle
} from './types';

const TEXT = '#212121';

export function bodyStyle(template: Template, size = 10): TextStyle {
  return { font: template.fonts[0]?.family ?? 'body', size, color: TEXT };
}

export function boldStyle(template: Template, size = 10): TextStyle {
  const bold = template.fonts.find(f => f.family.includes('bold'));
  return { font: bold?.family ?? template.fonts[0]?.family ?? 'body', size, color: TEXT };
}

function defaultColumnWidth(type: ScalarType): number | 'flex' {
  switch (type) {
    case 'number':
      return 60;
    case 'currency':
      return 90;
    case 'date':
      return 110;
    default:
      return 'flex';
  }
}

/** Sensible starter table for a list field: one column per item field. */
export function defaultTableFor(
  listField: ListFieldDescriptor,
  template: Template
): TableFlowItem {
  const columns: TableColumn[] = listField.itemFields.map(f => ({
    itemKey: f.key,
    label: f.label,
    width: defaultColumnWidth(f.type),
    align: f.type === 'number' || f.type === 'currency' ? 'right' : 'left',
    format: { type: f.type, pattern: f.format }
  }));
  return {
    id: newFlowId(),
    kind: 'table',
    binding: listField.key,
    columns,
    header: {
      height: 22,
      repeatOnContinuation: true,
      style: boldStyle(template),
      background: '#f2f2f2'
    },
    row: {
      minHeight: 22,
      padding: 6,
      style: bodyStyle(template),
      divider: { color: '#d9d9d9', thickness: 0.5 }
    }
  };
}

const MARGIN = 56;
const TITLE_H = 22;
const ROW_H = 18;
const LABEL_W = 92;
/** Must clear one line (size 10 x 1.3 default) or the renderer warns. */
const FIELD_H = 14;
const MIN_CONTENT_H = 120;
/**
 * A sample value longer than this can't fit a fixed header slot, so the field
 * goes to the flow as a wrapping paragraph instead of overlapping whatever
 * sits below it.
 */
const LONG_TEXT_CHARS = 60;

function isLongText(
  field: ScalarFieldDescriptor,
  descriptor: ModelDescriptor
): boolean {
  if (field.type !== 'string') return false;
  const value = getByPath(descriptor.sample, field.key);
  return typeof value === 'string' && value.length > LONG_TEXT_CHARS;
}

export interface StarterTemplateInit {
  id: string;
  /** Defaults to the model's label, or 'Plantilla base'. */
  name?: string;
  docType: Template['docType'];
  /** Required when docType is 'custom'. */
  pageSize?: Template['pageSize'];
  locale?: string;
  /** Drives every generated field, label and table. */
  descriptor?: ModelDescriptor;
}

/**
 * Human-readable name for a generated template — the model's own label, which
 * hosts already write for people ('Cotización', 'Nota de remisión'). The
 * machine-stable identity is `Template.model`, so look starters up by that,
 * never by name.
 */
export function starterTemplateName(descriptor?: ModelDescriptor): string {
  return descriptor?.label?.trim() || 'Plantilla base';
}

/**
 * Build a usable template that lays out EVERY field the model declares: each
 * scalar as a label + bound value in a two-column grid, and each list as a
 * table in the content flow. Deliberately plain — it exists to be edited.
 */
export function createStarterTemplate(init: StarterTemplateInit): Template {
  const descriptor = init.descriptor;
  const base = createTemplate({
    id: init.id,
    name: init.name ?? starterTemplateName(descriptor),
    docType: init.docType,
    pageSize: init.pageSize,
    locale: init.locale,
    model: descriptor?.name
  });
  return applyStarterLayout(base, descriptor);
}

/**
 * Fill an EXISTING template with the starter layout, replacing whatever
 * elements and flow it had. Identity (id, name, model, page size, background)
 * is untouched — this is what the editor's blank-page action runs.
 */
export function applyStarterLayout(
  template: Template,
  descriptor?: ModelDescriptor
): Template {
  const base = template;
  const { width: pageW, height: pageH } = base.pageSize;
  const contentW = pageW - MARGIN * 2;
  const elements: TemplateElement[] = [];

  const allScalars = (descriptor?.fields.filter(f => f.kind === 'scalar') ??
    []) as ScalarFieldDescriptor[];
  const lists = (descriptor?.fields.filter(f => f.kind === 'list') ??
    []) as ListFieldDescriptor[];
  // Short values sit in the header grid; long prose flows below the tables.
  const scalars = descriptor
    ? allScalars.filter(f => !isLongText(f, descriptor))
    : allScalars;
  const paragraphs = descriptor
    ? allScalars.filter(f => isLongText(f, descriptor))
    : [];

  let y = MARGIN;

  // Title — the document's name, edit-in-place with a double click.
  elements.push({
    id: newElementId(),
    kind: 'text',
    scope: 'first',
    frame: { x: MARGIN, y, width: contentW, height: TITLE_H },
    content: descriptor?.label ?? base.name,
    style: boldStyle(base, 16)
  });
  y += TITLE_H + 10;

  // Every scalar field, two per row: a static label and the bound value.
  const colW = contentW / 2;
  const valueW = colW - LABEL_W - 8;
  scalars.forEach((field, i) => {
    const col = i % 2;
    const x = MARGIN + col * colW;
    const rowY = y + Math.floor(i / 2) * ROW_H;
    elements.push({
      id: newElementId(),
      kind: 'text',
      scope: 'first',
      frame: { x, y: rowY, width: LABEL_W, height: FIELD_H },
      content: `${field.label}:`,
      style: boldStyle(base)
    });
    elements.push({
      id: newElementId(),
      kind: 'field',
      scope: 'first',
      frame: { x: x + LABEL_W, y: rowY, width: valueW, height: FIELD_H },
      binding: field.key,
      format: { type: field.type, pattern: field.format },
      style: bodyStyle(base)
    });
  });
  y += Math.ceil(scalars.length / 2) * ROW_H + 6;

  // Separator between the header block and the flowing content.
  elements.push({
    id: newElementId(),
    kind: 'line',
    scope: 'first',
    frame: { x: MARGIN, y, width: contentW, height: 0 },
    direction: 'h',
    thickness: 1,
    color: '#d9d9d9'
  });
  y += 14;

  // The content region must never collapse on a short page, so clamp its top.
  const yBottom = pageH - MARGIN;
  const yTop = Math.min(y, Math.max(MARGIN, yBottom - MIN_CONTENT_H));

  // Tables first, then the long free-text fields (notes, observations).
  const stack: FlowItem[] = [
    ...lists.map(list => defaultTableFor(list, base)),
    ...paragraphs.map(field => ({
      id: newFlowId(),
      kind: 'text-block' as const,
      content: `${field.label}: {{${field.key}}}`,
      style: bodyStyle(base),
      spacingAfter: 8
    }))
  ];
  if (stack.length === 0) {
    stack.push({
      id: newFlowId(),
      kind: 'text-block',
      content: 'Escribe aquí el contenido del documento.',
      style: bodyStyle(base, 11)
    });
  }

  return {
    ...base,
    margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
    elements,
    flow: {
      regions: {
        first: { x: MARGIN, yTop, yBottom, width: contentW },
        middle: { x: MARGIN, yTop: MARGIN, yBottom, width: contentW }
      },
      stack
    }
  };
}
