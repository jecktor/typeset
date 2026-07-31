import type { ScalarType } from './types';

/**
 * How a host application describes one of its models to the editor and
 * (optionally) the renderer. `sample` is required: it powers the editor's
 * WYSIWYG preview and doubles as documentation of the data contract.
 */
export interface ScalarFieldDescriptor {
  kind: 'scalar';
  /** Dot path into the data object, e.g. 'customer.name'. */
  key: string;
  label: string;
  type: ScalarType;
  /** Default ValueFormat.pattern applied when the field is placed. */
  format?: string;
}

export interface ListItemFieldDescriptor {
  key: string;
  label: string;
  type: ScalarType;
  format?: string;
}

export interface ListFieldDescriptor {
  kind: 'list';
  key: string;
  label: string;
  itemFields: ListItemFieldDescriptor[];
}

export type FieldDescriptor = ScalarFieldDescriptor | ListFieldDescriptor;

export interface ModelDescriptor {
  /** Stable identifier stored in Template.model, e.g. 'cotizacion'. */
  name: string;
  label: string;
  fields: FieldDescriptor[];
  /**
   * Sample record matching the field shape. Include one short and one long
   * list item so template authors see real wrapping in preview.
   */
  sample: Record<string, unknown>;
}

/** Resolve a dot path ('customer.name', 'items.0.total') against an object. */
export function getByPath(obj: unknown, path: string): unknown {
  if (obj == null || !path) return undefined;
  let current: unknown = obj;
  for (const segment of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
