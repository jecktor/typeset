import type { PDFDocument, PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import {
  getByPath,
  type FormatterRegistry,
  type MeasureProvider,
  type Template
} from '../core';
import { toResolver, type AssetsInput } from './assets';
import { embedImage } from './images';
import { planLayout, type DrawOp } from './layout';

export interface RenderOptions {
  /** A parsed template — use parseTemplate() on raw JSON first. */
  template: Template;
  /** Plain data object matching the template's model contract. */
  data: Record<string, unknown>;
  /** Backgrounds, logos, custom fonts. Resolver or prefetched byte map. */
  assets?: AssetsInput;
  /** @pdf-lib/fontkit instance; required iff the template uses asset fonts. */
  fontkit?: unknown;
  formatters?: FormatterRegistry;
  /** Fetches bytes for 'image-url' bindings. Defaults to global fetch. */
  fetchImage?: (url: string) => Promise<Uint8Array>;
  /** Layout warnings (missing images, frame overflows...) are reported here. */
  onWarning?: (warning: string) => void;
}

interface ImageRef {
  id: string;
  assetId?: string;
  url?: string;
}

function collectImageRefs(
  template: Template,
  data: Record<string, unknown>
): ImageRef[] {
  const refs: ImageRef[] = [];
  const add = (id: string, assetId?: string, binding?: string) => {
    if (assetId) {
      refs.push({ id, assetId });
      return;
    }
    if (!binding) return;
    const value = getByPath(data, binding);
    if (typeof value !== 'string' || !value) return;
    if (/^https?:\/\//.test(value)) refs.push({ id, url: value });
    else refs.push({ id, assetId: value });
  };
  for (const el of template.elements) {
    if (el.kind === 'image') add(el.id, el.assetId, el.binding);
  }
  for (const item of template.flow?.stack ?? []) {
    if (item.kind === 'image-block') add(item.id, item.assetId, item.binding);
  }
  return refs;
}

async function defaultFetchImage(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** '#rrggbb' → pdf-lib color, bound to the lazily imported `rgb`. */
type ColorFn = (hex: string) => ReturnType<typeof import('pdf-lib').rgb>;

function makeColorFn(rgb: typeof import('pdf-lib').rgb): ColorFn {
  return hex =>
    rgb(
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255
    );
}

function executeOp(
  page: PDFPage,
  op: DrawOp,
  pageH: number,
  fonts: Map<string, PDFFont>,
  images: Map<string, PDFImage>,
  hexToRgb: ColorFn
) {
  switch (op.op) {
    case 'text':
      page.drawText(op.text, {
        x: op.x,
        y: pageH - op.y,
        size: op.size,
        font: fonts.get(op.font),
        color: hexToRgb(op.color)
      });
      break;
    case 'rect':
      page.drawRectangle({
        x: op.x,
        y: pageH - op.y - op.height,
        width: op.width,
        height: op.height,
        color: hexToRgb(op.color)
      });
      break;
    case 'line':
      page.drawLine({
        start: { x: op.x1, y: pageH - op.y1 },
        end: { x: op.x2, y: pageH - op.y2 },
        thickness: op.thickness,
        color: hexToRgb(op.color)
      });
      break;
    case 'image': {
      const img = images.get(op.ref);
      if (!img) break;
      page.drawImage(img, {
        x: op.x,
        y: pageH - op.y - op.height,
        width: op.width,
        height: op.height
      });
      break;
    }
  }
}

/**
 * Render a template + data into PDF bytes. Performs no filesystem I/O; runs
 * identically in Node route handlers and the browser (editor preview mode).
 */
export async function renderPdf(options: RenderOptions): Promise<Uint8Array> {
  const { template, data } = options;
  const resolver = toResolver(options.assets);

  // Loaded on first render, never at module scope: pdf-lib stays out of every
  // consumer's boot bundle, and no static edge exists for a bundler to weave
  // into an import cycle. Repeat calls hit the module cache.
  const pdfLib = await import('pdf-lib');
  const hexToRgb = makeColorFn(pdfLib.rgb);

  const doc = await pdfLib.PDFDocument.create();
  if (options.fontkit) {
    (doc as unknown as { registerFontkit(fk: unknown): void }).registerFontkit(
      options.fontkit
    );
  }

  // Fonts — embedded once; their metrics also drive layout measurement.
  const fonts = new Map<string, PDFFont>();
  for (const spec of template.fonts) {
    if (spec.source.kind === 'standard') {
      fonts.set(spec.family, await doc.embedFont(spec.source.name));
    } else {
      if (!options.fontkit) {
        throw new Error(
          `Font family '${spec.family}' uses a custom font asset — pass ` +
            `@pdf-lib/fontkit via options.fontkit`
        );
      }
      const bytes = await resolver.resolve(spec.source.assetId);
      fonts.set(spec.family, await doc.embedFont(bytes, { subset: true }));
    }
  }
  const measure: MeasureProvider = family => {
    const font = fonts.get(family);
    if (!font) {
      throw new Error(
        `Unknown font family '${family}' — declare it in template.fonts`
      );
    }
    return font;
  };

  // Background PDFs, loaded once per asset.
  const bgDocs = new Map<string, PDFDocument>();
  for (const ref of Object.values(template.background ?? {})) {
    if (ref && !bgDocs.has(ref.assetId)) {
      bgDocs.set(
        ref.assetId,
        await pdfLib.PDFDocument.load(await resolver.resolve(ref.assetId))
      );
    }
  }

  // Images: embed up front so layout knows intrinsic sizes.
  const images = new Map<string, PDFImage>();
  const imageInfos = new Map<string, { width: number; height: number }>();
  for (const ref of collectImageRefs(template, data)) {
    try {
      const bytes = ref.url
        ? await (options.fetchImage ?? defaultFetchImage)(ref.url)
        : await resolver.resolve(ref.assetId!);
      const img = await embedImage(doc, bytes);
      images.set(ref.id, img);
      imageInfos.set(ref.id, { width: img.width, height: img.height });
    } catch (err) {
      options.onWarning?.(
        `image '${ref.id}' could not be loaded: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const plan = planLayout({
    template,
    data,
    measure,
    images: imageInfos,
    formatters: options.formatters
  });
  for (const warning of plan.warnings) options.onWarning?.(warning);

  for (const planned of plan.pages) {
    let page: PDFPage;
    if (planned.background) {
      const src = bgDocs.get(planned.background.assetId);
      if (!src) {
        throw new Error(
          `Background asset '${planned.background.assetId}' was not loaded`
        );
      }
      const [copied] = await doc.copyPages(src, [planned.background.pageIndex]);
      page = doc.addPage(copied!);
    } else {
      page = doc.addPage([template.pageSize.width, template.pageSize.height]);
    }
    const pageH = page.getSize().height;
    for (const op of planned.ops) {
      executeOp(page, op, pageH, fonts, images, hexToRgb);
    }
  }

  return doc.save();
}
