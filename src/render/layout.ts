/**
 * Pure layout planner: (template, data, font metrics, image sizes) → a list
 * of planned pages with primitive draw ops, all in top-left-origin points.
 * No pdf-lib, no I/O — the algorithm is fully unit-testable, and the editor
 * can reuse it for true-to-output preview math.
 */
import {
  cellImageSource,
  DEFAULT_IMAGE_HEIGHT,
  formatValue,
  getByPath,
  imageRefFor,
  interpolate,
  isImageColumn,
  lineHeightOf,
  visibleColumns,
  wrapText,
  type BackgroundRef,
  type FlowRegion,
  type FormatterRegistry,
  type Frame,
  type ImageBlockFlowItem,
  type MeasureProvider,
  type PageScope,
  type TableColumn,
  type TableFlowItem,
  type Template,
  type TemplateElement,
  type TextBlockFlowItem,
  type TextStyle
} from '../core';

export type DrawOp =
  /** y is the text BASELINE in top-down coords. */
  | { op: 'text'; x: number; y: number; text: string; font: string; size: number; color: string }
  /** y is the rectangle's TOP edge. */
  | { op: 'rect'; x: number; y: number; width: number; height: number; color: string }
  | { op: 'line'; x1: number; y1: number; x2: number; y2: number; thickness: number; color: string }
  /** y is the image's TOP edge. `ref` keys into the caller's image map. */
  | { op: 'image'; ref: string; x: number; y: number; width: number; height: number };

export type PageKind = 'first' | 'middle' | 'last';

export interface PlannedPage {
  kind: PageKind;
  background?: BackgroundRef;
  ops: DrawOp[];
}

export interface ImageInfo {
  width: number;
  height: number;
}

export interface LayoutInput {
  template: Template;
  data: Record<string, unknown>;
  measure: MeasureProvider;
  /**
   * Intrinsic image sizes keyed by element / flow-item id, and by
   * imageRefFor(source) for the pictures inside table rows.
   */
  images: Map<string, ImageInfo>;
  formatters?: FormatterRegistry;
  /**
   * Per-document override for product images in tables: true forces them on,
   * false leaves them out. Absent → each table's own `images.enabled`.
   */
  includeImages?: boolean;
}

export interface LayoutResult {
  pages: PlannedPage[];
  warnings: string[];
}

const PARAGRAPH_GAP = 6;
const LAST_BLOCK_GAP = 6;
const FOOTER_TOP_GAP = 12;

export function planLayout(input: LayoutInput): LayoutResult {
  const { template, data, measure, images } = input;
  const { locale } = template;
  const formatters = input.formatters;
  const includeImages = input.includeImages;
  const pageH = template.pageSize.height;
  const warnings: string[] = [];
  const pages: PlannedPage[] = [];

  const resolve = (path: string) => getByPath(data, path);

  const frameTop = (frame: Frame): number =>
    frame.anchor === 'bottom' ? pageH - frame.y - frame.height : frame.y;

  function drawTextInFrame(
    page: PlannedPage,
    text: string,
    frame: Frame,
    style: TextStyle
  ) {
    if (!text) return;
    const font = measure(style.font);
    const lines = wrapText(text, font, style.size, frame.width);
    const lh = lineHeightOf(style);
    const top = frameTop(frame);
    let baseline = top + style.size;
    for (const line of lines) {
      const w = font.widthOfTextAtSize(line, style.size);
      const x =
        style.align === 'right'
          ? frame.x + frame.width - w
          : style.align === 'center'
            ? frame.x + (frame.width - w) / 2
            : frame.x;
      page.ops.push({
        op: 'text',
        x,
        y: baseline,
        text: line,
        font: style.font,
        size: style.size,
        color: style.color
      });
      baseline += lh;
    }
    if (lines.length * lh > frame.height + lh * 0.5) {
      warnings.push(
        `text overflows its frame (${lines.length} lines of ${lh.toFixed(1)}pt in ${frame.height}pt)`
      );
    }
  }

  function stampElement(page: PlannedPage, el: TemplateElement) {
    switch (el.kind) {
      case 'field':
        drawTextInFrame(
          page,
          formatValue(resolve(el.binding), el.format, locale, formatters),
          el.frame,
          el.style
        );
        break;
      case 'text':
        drawTextInFrame(
          page,
          interpolate(el.content, resolve, locale, formatters),
          el.frame,
          el.style
        );
        break;
      case 'image': {
        const info = images.get(el.id);
        if (!info) {
          warnings.push(`image element '${el.id}' has no image data — skipped`);
          break;
        }
        const top = frameTop(el.frame);
        let x = el.frame.x;
        let y = top;
        let w = el.frame.width;
        let h = el.frame.height;
        if (el.fit === 'contain') {
          const scale = Math.min(w / info.width, h / info.height);
          w = info.width * scale;
          h = info.height * scale;
          x = el.frame.x + (el.frame.width - w) / 2;
          y = top + (el.frame.height - h) / 2;
        }
        page.ops.push({ op: 'image', ref: el.id, x, y, width: w, height: h });
        break;
      }
      case 'line': {
        const top = frameTop(el.frame);
        page.ops.push(
          el.direction === 'h'
            ? { op: 'line', x1: el.frame.x, y1: top, x2: el.frame.x + el.frame.width, y2: top, thickness: el.thickness, color: el.color }
            : { op: 'line', x1: el.frame.x, y1: top, x2: el.frame.x, y2: top + el.frame.height, thickness: el.thickness, color: el.color }
        );
        break;
      }
    }
  }

  function stampElements(page: PlannedPage, scopes: PageScope[]) {
    for (const el of template.elements) {
      if (scopes.includes(el.scope)) stampElement(page, el);
    }
  }

  const bg = template.background ?? {};

  function addPage(kind: PageKind): PlannedPage {
    const background =
      kind === 'first'
        ? bg.first
        : kind === 'middle'
          ? (bg.middle ?? bg.first)
          : (bg.last ?? bg.middle ?? bg.first);
    const page: PlannedPage = { kind, background, ops: [] };
    pages.push(page);
    stampElements(
      page,
      kind === 'first'
        ? ['first', 'all']
        : kind === 'middle'
          ? ['middle', 'all']
          : ['last', 'all']
    );
    return page;
  }

  let page = addPage('first');

  // Pure stamping template: one page that is both first and last.
  if (!template.flow) {
    stampElements(page, ['last']);
    return { pages, warnings };
  }

  const { regions, stack } = template.flow;
  if (regions.first.width !== regions.middle.width) {
    warnings.push(
      'flow regions first/middle have different widths — text wrapped near a page break may not reflow exactly'
    );
  }

  let region: FlowRegion = regions.first;
  let cursor = region.yTop;

  function newFlowPage() {
    page = addPage('middle');
    region = regions.middle;
    cursor = region.yTop;
  }

  /** Break to a new page if `needed` points don't fit above the region floor. */
  function ensureSpace(needed: number, onBreak?: () => void) {
    if (cursor + needed <= region.yBottom) return;
    if (needed > regions.middle.yBottom - regions.middle.yTop) {
      warnings.push(
        `flow item needs ${Math.ceil(needed)}pt but the middle region only has ` +
          `${regions.middle.yBottom - regions.middle.yTop}pt — content will overflow`
      );
    }
    newFlowPage();
    onBreak?.();
  }

  function layoutTextBlock(item: TextBlockFlowItem) {
    const text = item.binding
      ? formatValue(resolve(item.binding), undefined, locale, formatters)
      : interpolate(item.content ?? '', resolve, locale, formatters);
    if (!text.trim()) return;
    const font = measure(item.style.font);
    const lh = lineHeightOf(item.style);
    const spaceW = font.widthOfTextAtSize(' ', item.style.size);

    for (const para of text.split(/\n+/).map(p => p.trim()).filter(Boolean)) {
      const lines = wrapText(para, font, item.style.size, region.width);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        ensureSpace(lh);
        const baseline = cursor + item.style.size;
        const words = line.split(/\s+/).filter(Boolean);
        const justified = item.justify && i < lines.length - 1 && words.length > 1;
        if (justified) {
          const wordsWidth = words.reduce(
            (acc, w) => acc + font.widthOfTextAtSize(w, item.style.size),
            0
          );
          const extraPerGap = (region.width - wordsWidth) / (words.length - 1);
          const gapW = extraPerGap > 0 ? extraPerGap : spaceW;
          let x = region.x;
          for (const word of words) {
            page.ops.push({ op: 'text', x, y: baseline, text: word, font: item.style.font, size: item.style.size, color: item.style.color });
            x += font.widthOfTextAtSize(word, item.style.size) + gapW;
          }
        } else {
          const w = font.widthOfTextAtSize(line, item.style.size);
          const x =
            item.style.align === 'right'
              ? region.x + region.width - w
              : item.style.align === 'center'
                ? region.x + (region.width - w) / 2
                : region.x;
          page.ops.push({ op: 'text', x, y: baseline, text: line, font: item.style.font, size: item.style.size, color: item.style.color });
        }
        cursor += lh;
      }
      cursor += PARAGRAPH_GAP;
    }
    cursor += item.spacingAfter ?? 0;
  }

  function layoutImageBlock(item: ImageBlockFlowItem) {
    const info = images.get(item.id);
    if (!info) {
      warnings.push(`image block '${item.id}' has no image data — skipped`);
      return;
    }
    const scale = Math.min(region.width / info.width, item.maxHeight / info.height);
    const w = info.width * scale;
    const h = info.height * scale;
    ensureSpace(h);
    const x =
      item.align === 'left'
        ? region.x
        : item.align === 'right'
          ? region.x + region.width - w
          : region.x + (region.width - w) / 2;
    page.ops.push({ op: 'image', ref: item.id, x, y: cursor, width: w, height: h });
    cursor += h + (item.spacingAfter ?? 8);
  }

  function layoutTable(item: TableFlowItem) {
    const list = resolve(item.binding);
    if (!Array.isArray(list)) {
      warnings.push(`table '${item.id}': binding '${item.binding}' is not an array — skipped`);
      return;
    }

    // Hidden image columns give their width back to the rest of the table.
    const columns = visibleColumns(item, includeImages);
    if (columns.length === 0) {
      warnings.push(`table '${item.id}': every column is hidden — skipped`);
      return;
    }

    const columnGeometry = () => {
      const fixed = columns.reduce(
        (acc, c) => acc + (typeof c.width === 'number' ? c.width : 0),
        0
      );
      const flexCount = columns.filter(c => c.width === 'flex').length;
      const flexW = flexCount > 0 ? Math.max(0, (region.width - fixed) / flexCount) : 0;
      let x = region.x;
      return columns.map(col => {
        const w = col.width === 'flex' ? flexW : col.width;
        const geo = { col, x, w };
        x += w;
        return geo;
      });
    };

    function drawHeader() {
      const h = item.header.height;
      const style = item.header.style;
      if (item.header.background) {
        page.ops.push({ op: 'rect', x: region.x, y: cursor, width: region.width, height: h, color: item.header.background });
      }
      const font = measure(style.font);
      for (const { col, x, w } of columnGeometry()) {
        const tw = font.widthOfTextAtSize(col.label, style.size);
        const tx =
          col.align === 'right'
            ? x + w - tw - item.row.padding
            : col.align === 'center'
              ? x + (w - tw) / 2
              : x + item.row.padding;
        page.ops.push({ op: 'text', x: tx, y: cursor + (h + style.size) / 2 - 1, text: col.label, font: style.font, size: style.size, color: style.color });
      }
      cursor += h;
    }

    ensureSpace(item.header.height + item.row.minHeight);
    drawHeader();

    const rowLh = lineHeightOf(item.row.style);
    const rowPadY = item.row.paddingY ?? item.row.padding;
    /** Rows whose picture never made it into the image map. */
    let missingImages = 0;

    /** Horizontal placement of `width` points of content inside a cell. */
    const cellX = (col: TableColumn, x: number, w: number, width: number) =>
      col.align === 'right'
        ? x + w - width - item.row.padding
        : col.align === 'center'
          ? x + (w - width) / 2
          : x + item.row.padding;

    for (const rowData of list) {
      const cells = columnGeometry().map(({ col, x, w }) => {
        const inner = Math.max(1, w - item.row.padding * 2);
        if (isImageColumn(col)) {
          // The row's own photo, or the table's fallback for products
          // without one — cellImageSource() already made that choice.
          const ref = imageRefFor(cellImageSource(rowData, col, item));
          const info = images.get(ref);
          if (!info) {
            missingImages++;
            return { kind: 'image' as const, col, x, w, image: null };
          }
          const maxH = col.imageHeight ?? DEFAULT_IMAGE_HEIGHT;
          const scale = Math.min(inner / info.width, maxH / info.height);
          const image = {
            ref,
            width: info.width * scale,
            height: info.height * scale
          };
          return { kind: 'image' as const, col, x, w, image };
        }
        const style = col.style ?? item.row.style;
        const font = measure(style.font);
        const text = formatValue(getByPath(rowData, col.itemKey), col.format, locale, formatters);
        const lines = wrapText(text, font, style.size, inner);
        return { kind: 'text' as const, col, x, w, style, font, lines };
      });

      const textCells = cells.filter(c => c.kind === 'text');
      const maxLines = Math.max(1, ...textCells.map(c => c.lines.length));
      const tallestImage = Math.max(
        0,
        ...cells.map(c => (c.kind === 'image' ? (c.image?.height ?? 0) : 0))
      );
      const rowH = Math.max(
        item.row.minHeight,
        textCells.length > 0 ? maxLines * rowLh + rowPadY * 2 : 0,
        tallestImage > 0 ? tallestImage + rowPadY * 2 : 0
      );

      ensureSpace(rowH, () => {
        if (item.header.repeatOnContinuation) drawHeader();
      });

      for (const cell of cells) {
        if (cell.kind === 'image') {
          if (!cell.image) continue;
          page.ops.push({
            op: 'image',
            ref: cell.image.ref,
            x: cellX(cell.col, cell.x, cell.w, cell.image.width),
            // Pictures ride the middle of the row; text starts at its top.
            y: cursor + (rowH - cell.image.height) / 2,
            width: cell.image.width,
            height: cell.image.height
          });
          continue;
        }
        let baseline = cursor + rowPadY + cell.style.size;
        for (const line of cell.lines) {
          const tw = cell.font.widthOfTextAtSize(line, cell.style.size);
          page.ops.push({ op: 'text', x: cellX(cell.col, cell.x, cell.w, tw), y: baseline, text: line, font: cell.style.font, size: cell.style.size, color: cell.style.color });
          baseline += rowLh;
        }
      }
      if (item.row.divider) {
        page.ops.push({ op: 'line', x1: region.x, y1: cursor + rowH, x2: region.x + region.width, y2: cursor + rowH, thickness: item.row.divider.thickness, color: item.row.divider.color });
      }
      cursor += rowH;
    }

    if (missingImages > 0) {
      warnings.push(
        `table '${item.id}': ${missingImages} row image(s) could not be loaded — cells left empty`
      );
    }

    if (item.footer && item.footer.rows.length > 0) {
      const rowGap = item.footer.rowGap ?? 16;
      const footerH = FOOTER_TOP_GAP + item.footer.rows.length * rowGap;
      // Totals are atomic: never orphaned from each other.
      ensureSpace(footerH);
      cursor += FOOTER_TOP_GAP;
      const right = region.x + region.width;
      const labelGap = 14;
      for (const fr of item.footer.rows) {
        const value = formatValue(resolve(fr.binding), fr.format, locale, formatters);
        const lFont = measure(fr.labelStyle.font);
        const vFont = measure(fr.valueStyle.font);
        const vW = vFont.widthOfTextAtSize(value, fr.valueStyle.size);
        const lW = lFont.widthOfTextAtSize(fr.label, fr.labelStyle.size);
        // Footer rows are a baseline-stepped ladder: the cursor IS the
        // baseline, rowGap advances baseline-to-baseline.
        const baseline = cursor;
        page.ops.push({ op: 'text', x: right - vW - labelGap - lW, y: baseline, text: fr.label, font: fr.labelStyle.font, size: fr.labelStyle.size, color: fr.labelStyle.color });
        page.ops.push({ op: 'text', x: right - vW, y: baseline, text: value, font: fr.valueStyle.font, size: fr.valueStyle.size, color: fr.valueStyle.color });
        cursor += rowGap;
      }
    }
  }

  for (const item of stack) {
    switch (item.kind) {
      case 'spacer':
        cursor += item.height;
        break;
      case 'text-block':
        layoutTextBlock(item);
        break;
      case 'image-block':
        layoutImageBlock(item);
        break;
      case 'table':
        layoutTable(item);
        break;
    }
  }

  // Last-page resolution: stamp 'last' elements onto the final flow page when
  // they fit below the cursor; otherwise append a dedicated last page.
  const lastEls = template.elements.filter(e => e.scope === 'last');
  if (lastEls.length > 0) {
    const lastBlockTop = Math.min(...lastEls.map(e => frameTop(e.frame)));
    if (cursor <= lastBlockTop - LAST_BLOCK_GAP) {
      stampElements(page, ['last']);
    } else {
      addPage('last');
    }
  }

  return { pages, warnings };
}
