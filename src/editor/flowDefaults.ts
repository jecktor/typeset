import type {
  ListFieldDescriptor,
  ScalarType,
  TableColumn,
  TableFlowItem,
  Template,
  TemplateElement,
  TextStyle
} from '../core';
import { newElementId, newFlowId, type PlacingSpec, type ScopeTab } from './store';

const TEXT = '#212121';

function bodyStyle(template: Template, size = 10): TextStyle {
  return { font: template.fonts[0]?.family ?? 'body', size, color: TEXT };
}

function boldStyle(template: Template, size = 10): TextStyle {
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

export function defaultTextBlock(template: Template) {
  return {
    id: newFlowId(),
    kind: 'text-block' as const,
    content: 'Texto en el flujo',
    style: bodyStyle(template, 11)
  };
}

export function defaultImageBlock() {
  return {
    id: newFlowId(),
    kind: 'image-block' as const,
    maxHeight: 160,
    align: 'center' as const
  };
}

export function defaultSpacer() {
  return { id: newFlowId(), kind: 'spacer' as const, height: 12 };
}

/** Build a new absolutely-positioned element at a canvas point. */
export function createElementAt(
  spec: PlacingSpec,
  x: number,
  y: number,
  tab: ScopeTab,
  template: Template
): TemplateElement | null {
  const base = {
    id: newElementId(),
    scope: tab as TemplateElement['scope'],
    frame: { x, y, width: 150, height: 14 }
  };
  switch (spec.kind) {
    case 'field':
      return {
        ...base,
        kind: 'field',
        binding: spec.binding ?? '',
        format: spec.format,
        style: bodyStyle(template)
      };
    case 'text':
      return { ...base, kind: 'text', content: 'Texto', style: bodyStyle(template) };
    case 'image':
      return {
        ...base,
        frame: { ...base.frame, width: 120, height: 80 },
        kind: 'image',
        fit: 'contain'
      };
    case 'line':
      return {
        ...base,
        frame: { ...base.frame, width: 200, height: 0 },
        kind: 'line',
        direction: 'h',
        thickness: 1,
        color: '#212121'
      };
    default:
      return null;
  }
}
