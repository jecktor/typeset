/**
 * Rules for product images inside table rows (the line items of a quote).
 * They live here, next to the types, so the layout planner, the renderer's
 * image collector, the editor preview and the validator all answer "which
 * columns are drawn?" and "which picture does this row get?" identically.
 */
import { getByPath } from './model';
import type { TableColumn, TableFlowItem } from './types';

/**
 * Asset id served by the package itself — the built-in "sin imagen" picture.
 * Hosts never store these bytes: toResolver() intercepts the id before any
 * host resolver sees it.
 */
export const PLACEHOLDER_IMAGE_ASSET = 'typeset:placeholder-image';

/** Cell height used by image columns that don't set their own, in points. */
export const DEFAULT_IMAGE_HEIGHT = 36;

/** Width an image column gets when nobody picked one, in points. */
export const DEFAULT_IMAGE_COLUMN_WIDTH = 54;

export const isImageColumn = (col: TableColumn): boolean => col.kind === 'image';

/**
 * Does this table draw its image columns? `override` is the per-document
 * answer (renderPdf's `includeImages`); without one the template author's
 * switch decides, and a table that never configured images keeps drawing
 * whatever columns it declares.
 */
export function tableShowsImages(
  item: TableFlowItem,
  override?: boolean
): boolean {
  return override ?? item.images?.enabled ?? true;
}

/** The columns actually drawn — image columns disappear when images are off. */
export function visibleColumns(
  item: TableFlowItem,
  override?: boolean
): TableColumn[] {
  return tableShowsImages(item, override)
    ? item.columns
    : item.columns.filter(col => !isImageColumn(col));
}

/**
 * The picture one cell shows: the row's own value when it has one, otherwise
 * the table's fallback. The result is a URL or an asset id — callers treat it
 * as opaque and key embedded images by imageRefFor().
 */
export function cellImageSource(
  row: unknown,
  col: TableColumn,
  item: TableFlowItem
): string {
  const value = getByPath(row, col.itemKey);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return item.images?.fallbackAssetId || PLACEHOLDER_IMAGE_ASSET;
}

/**
 * Key for an embedded row image. Derived from the source, not from the row
 * index, so a fallback repeated down 200 rows is embedded exactly once.
 */
export const imageRefFor = (source: string): string => `img:${source}`;
