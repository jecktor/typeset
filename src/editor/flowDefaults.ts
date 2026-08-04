import {
  bodyStyle,
  newElementId,
  newFlowId,
  type Template,
  type TemplateElement
} from '../core';
import type { PlacingSpec, ScopeTab } from './store';

// The table/style builders live in core so the starter-template generator (and
// backend seeding scripts) can reuse them without pulling in the editor.
export { defaultTableFor } from '../core';

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
