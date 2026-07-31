import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION, type FontSpec, type Template } from './types';
import { pageSizeForDocType } from './pages';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #rrggbb color');

const frameSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  anchor: z.enum(['top', 'bottom']).optional()
});

const standardFontName = z.enum([
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
  'Times-Roman',
  'Times-Bold',
  'Times-Italic',
  'Times-BoldItalic',
  'Courier',
  'Courier-Bold',
  'Courier-Oblique',
  'Courier-BoldOblique'
]);

const fontSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('standard'), name: standardFontName }),
  z.object({ kind: z.literal('asset'), assetId: z.string().min(1) })
]);

const fontSpecSchema = z.object({
  family: z.string().min(1),
  source: fontSourceSchema
});

const textStyleSchema = z.object({
  font: z.string().min(1),
  size: z.number().positive(),
  color: hexColor,
  align: z.enum(['left', 'center', 'right']).optional(),
  lineHeight: z.number().positive().optional()
});

const scalarType = z.enum([
  'string',
  'number',
  'currency',
  'date',
  'boolean',
  'image-url'
]);

const valueFormatSchema = z.object({
  type: scalarType,
  pattern: z.string().optional()
});

const pageScope = z.enum(['first', 'middle', 'last', 'all']);

const elementBase = {
  id: z.string().min(1),
  scope: pageScope,
  frame: frameSchema
};

const elementSchema = z.discriminatedUnion('kind', [
  z.object({
    ...elementBase,
    kind: z.literal('field'),
    binding: z.string().min(1),
    style: textStyleSchema,
    format: valueFormatSchema.optional()
  }),
  z.object({
    ...elementBase,
    kind: z.literal('text'),
    content: z.string(),
    style: textStyleSchema
  }),
  z.object({
    ...elementBase,
    kind: z.literal('image'),
    assetId: z.string().optional(),
    binding: z.string().optional(),
    fit: z.enum(['contain', 'stretch'])
  }),
  z.object({
    ...elementBase,
    kind: z.literal('line'),
    direction: z.enum(['h', 'v']),
    thickness: z.number().positive(),
    color: hexColor
  })
]);

const flowRegionSchema = z.object({
  x: z.number(),
  yTop: z.number(),
  yBottom: z.number(),
  width: z.number().positive()
});

const tableColumnSchema = z.object({
  itemKey: z.string().min(1),
  label: z.string(),
  width: z.union([z.number().positive(), z.literal('flex')]),
  align: z.enum(['left', 'center', 'right']).optional(),
  format: valueFormatSchema.optional(),
  style: textStyleSchema.optional()
});

const flowItemSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().min(1),
    kind: z.literal('table'),
    binding: z.string().min(1),
    columns: z.array(tableColumnSchema).min(1),
    header: z.object({
      height: z.number().positive(),
      repeatOnContinuation: z.boolean(),
      style: textStyleSchema,
      background: hexColor.optional()
    }),
    row: z.object({
      minHeight: z.number().positive(),
      padding: z.number().nonnegative(),
      paddingY: z.number().nonnegative().optional(),
      style: textStyleSchema,
      divider: z
        .object({ color: hexColor, thickness: z.number().positive() })
        .optional()
    }),
    footer: z
      .object({
        rows: z.array(
          z.object({
            label: z.string(),
            binding: z.string().min(1),
            format: valueFormatSchema.optional(),
            labelStyle: textStyleSchema,
            valueStyle: textStyleSchema
          })
        ),
        rowGap: z.number().nonnegative().optional()
      })
      .optional()
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('text-block'),
    binding: z.string().optional(),
    content: z.string().optional(),
    style: textStyleSchema,
    justify: z.boolean().optional(),
    spacingAfter: z.number().optional()
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('image-block'),
    binding: z.string().optional(),
    assetId: z.string().optional(),
    maxHeight: z.number().positive(),
    align: z.enum(['left', 'center', 'right']).optional(),
    spacingAfter: z.number().optional()
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('spacer'),
    height: z.number().nonnegative()
  })
]);

const backgroundRefSchema = z.object({
  assetId: z.string().min(1),
  pageIndex: z.number().int().nonnegative()
});

export const templateSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id: z.string().min(1),
  name: z.string().min(1),
  docType: z.enum(['carta', 'oficio', 'custom']),
  pageSize: z.object({
    width: z.number().positive(),
    height: z.number().positive()
  }),
  locale: z.string().min(2),
  model: z.string().optional(),
  fonts: z.array(fontSpecSchema),
  background: z
    .object({
      first: backgroundRefSchema.optional(),
      middle: backgroundRefSchema.optional(),
      last: backgroundRefSchema.optional()
    })
    .optional(),
  elements: z.array(elementSchema),
  flow: z
    .object({
      regions: z.object({
        first: flowRegionSchema,
        middle: flowRegionSchema
      }),
      stack: z.array(flowItemSchema)
    })
    .optional()
});

/**
 * Forward-only migration chain: migrations[n] upgrades a version-n document
 * to version n+1. Empty until schemaVersion 2 exists.
 */
const migrations: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {};

/**
 * Parse, migrate, and validate a persisted template. The only supported way
 * to read raw template JSON — consumers never touch it directly.
 * Refuses versions newer than this library knows (fail loud, never garbage).
 */
export function parseTemplate(json: unknown): Template {
  if (typeof json !== 'object' || json === null) {
    throw new Error('Template must be an object');
  }
  const version = (json as Record<string, unknown>).schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('Template is missing a valid integer schemaVersion');
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Template schemaVersion ${version} is newer than this library supports ` +
        `(${CURRENT_SCHEMA_VERSION}). Upgrade @pibytelabs/typeset.`
    );
  }
  let doc = json as Record<string, unknown>;
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    const migrate = migrations[v];
    if (!migrate) throw new Error(`No migration path from schemaVersion ${v}`);
    doc = { ...migrate(doc), schemaVersion: v + 1 };
  }
  return templateSchema.parse(doc) as Template;
}

/** Fonts every wizard-created template starts with. */
export const DEFAULT_FONTS: FontSpec[] = [
  { family: 'body', source: { kind: 'standard', name: 'Helvetica' } },
  { family: 'body-bold', source: { kind: 'standard', name: 'Helvetica-Bold' } },
  { family: 'body-italic', source: { kind: 'standard', name: 'Helvetica-Oblique' } }
];

export function createTemplate(init: {
  id: string;
  name: string;
  docType: Template['docType'];
  pageSize?: Template['pageSize'];
  locale?: string;
  model?: string;
}): Template {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: init.id,
    name: init.name,
    docType: init.docType,
    pageSize: pageSizeForDocType(init.docType, init.pageSize),
    locale: init.locale ?? 'es-MX',
    model: init.model,
    fonts: [...DEFAULT_FONTS],
    elements: []
  };
}
