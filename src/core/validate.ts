import type { ModelDescriptor } from './model';
import { isImageColumn } from './tables';
import type { Template } from './types';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
  /** Element or flow-item id the issue refers to, when applicable. */
  ref?: string;
}

/**
 * Enforce the v1 layout-model constraints at save/edit time so render-time
 * surprises can't happen. Errors block saving; warnings are advisory.
 */
export function validateTemplate(
  template: Template,
  descriptor?: ModelDescriptor
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fontFamilies = new Set(template.fonts.map(f => f.family));
  const scalarKeys = new Set(
    descriptor?.fields.filter(f => f.kind === 'scalar').map(f => f.key) ?? []
  );
  const listFields = new Map(
    descriptor?.fields
      .filter(f => f.kind === 'list')
      .map(f => [f.key, f] as const) ?? []
  );

  const checkFont = (family: string, ref: string) => {
    if (!fontFamilies.has(family)) {
      issues.push({
        severity: 'error',
        message: `La fuente «${family}» no está declarada en la plantilla`,
        ref
      });
    }
  };

  for (const el of template.elements) {
    if (el.kind === 'field' || el.kind === 'text') checkFont(el.style.font, el.id);
    if (el.kind === 'field' && descriptor && scalarKeys.size > 0 && !scalarKeys.has(el.binding)) {
      issues.push({
        severity: 'warning',
        message: `El campo «${el.binding}» no existe en el modelo ${descriptor.label}`,
        ref: el.id
      });
    }
    if (el.scope === 'last' && el.frame.anchor !== 'bottom') {
      issues.push({
        severity: 'warning',
        message:
          'Los elementos de última página deben anclarse al pie para reservar su espacio frente al contenido fluido',
        ref: el.id
      });
    }
    if (el.kind === 'image' && !el.assetId && !el.binding) {
      issues.push({
        severity: 'warning',
        message: 'La imagen no tiene archivo ni campo asignado',
        ref: el.id
      });
    }
  }

  const flow = template.flow;
  if (!flow) return issues;

  const { first, middle } = flow.regions;
  if (first.width !== middle.width) {
    issues.push({
      severity: 'warning',
      message:
        'El área de contenido tiene distinto ancho en la primera página y en las intermedias; el texto puede acomodarse diferente al cambiar de página'
    });
  }
  for (const [name, region] of [['primera', first], ['intermedias', middle]] as const) {
    if (region.yBottom <= region.yTop) {
      issues.push({
        severity: 'error',
        message: `El área de contenido (${name}) tiene altura cero o negativa`
      });
    }
    if (region.yBottom > template.pageSize.height || region.x + region.width > template.pageSize.width) {
      issues.push({
        severity: 'warning',
        message: `El área de contenido (${name}) se sale de la página`
      });
    }
  }

  const tableCount = flow.stack.filter(i => i.kind === 'table').length;
  for (const item of flow.stack) {
    if (item.kind === 'table') {
      if (item.columns.length === 0) {
        issues.push({ severity: 'error', message: 'La tabla no tiene columnas', ref: item.id });
      }
      const fixed = item.columns.reduce(
        (a, c) => a + (typeof c.width === 'number' ? c.width : 0),
        0
      );
      if (fixed > Math.min(first.width, middle.width)) {
        issues.push({
          severity: 'error',
          message: `Las columnas de ancho fijo de la tabla (${fixed}pt) exceden el ancho del área de contenido`,
          ref: item.id
        });
      }
      if (item.images?.enabled && !item.columns.some(isImageColumn)) {
        issues.push({
          severity: 'warning',
          message:
            'La tabla incluye imágenes pero ninguna columna las muestra; añade una columna de imagen',
          ref: item.id
        });
      }
      checkFont(item.header.style.font, item.id);
      checkFont(item.row.style.font, item.id);
      for (const col of item.columns) if (col.style) checkFont(col.style.font, item.id);
      for (const fr of item.footer?.rows ?? []) {
        checkFont(fr.labelStyle.font, item.id);
        checkFont(fr.valueStyle.font, item.id);
      }
      if (descriptor && listFields.size > 0) {
        const list = listFields.get(item.binding);
        if (!list) {
          issues.push({
            severity: 'warning',
            message: `La lista «${item.binding}» no existe en el modelo ${descriptor.label}`,
            ref: item.id
          });
        } else {
          const itemTypes = new Map(list.itemFields.map(f => [f.key, f.type]));
          for (const col of item.columns) {
            if (!itemTypes.has(col.itemKey)) {
              issues.push({
                severity: 'warning',
                message: `La columna «${col.label}» usa el campo «${col.itemKey}» que no existe en «${list.label}»`,
                ref: item.id
              });
              continue;
            }
            if (isImageColumn(col) && itemTypes.get(col.itemKey) !== 'image-url') {
              issues.push({
                severity: 'warning',
                message: `La columna «${col.label}» muestra imágenes, pero el campo «${col.itemKey}» no es una imagen; las partidas usarán la imagen por defecto`,
                ref: item.id
              });
            }
          }
        }
      }
    }
    if (item.kind === 'text-block') {
      checkFont(item.style.font, item.id);
      if (!item.binding && !item.content) {
        issues.push({
          severity: 'warning',
          message: 'El bloque de texto no tiene contenido ni campo asignado',
          ref: item.id
        });
      }
    }
    if (item.kind === 'image-block' && !item.assetId && !item.binding) {
      issues.push({
        severity: 'warning',
        message: 'El bloque de imagen no tiene archivo ni campo asignado',
        ref: item.id
      });
    }
  }
  if (tableCount > 1) {
    issues.push({
      severity: 'warning',
      message:
        'Hay más de una tabla en el área de contenido; se colocarán una debajo de la otra'
    });
  }

  return issues;
}
