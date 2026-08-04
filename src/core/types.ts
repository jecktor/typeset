/**
 * Core template types. This module has zero runtime dependencies — it is the
 * shared vocabulary between the editor, the renderer, and host applications.
 *
 * Coordinate system: PDF points, top-left origin, y grows downward. The
 * renderer flips to pdf-lib's bottom-left origin exactly once at the drawing
 * boundary.
 */

export const CURRENT_SCHEMA_VERSION = 1;

export type DocType = 'carta' | 'oficio' | 'custom';

export interface PageSize {
  width: number;
  height: number;
}

/** Editor-only visual aid; the renderer never reads it. All sides in points. */
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Which physical pages an element appears on. */
export type PageScope = 'first' | 'middle' | 'last' | 'all';

export interface Frame {
  x: number;
  /**
   * With anchor 'top' (default): distance from the top edge to the element's
   * top. With anchor 'bottom': distance from the bottom edge to the element's
   * BOTTOM — used to pin footers/signature blocks regardless of page height.
   */
  y: number;
  width: number;
  height: number;
  anchor?: 'top' | 'bottom';
}

export type StandardFontName =
  | 'Helvetica'
  | 'Helvetica-Bold'
  | 'Helvetica-Oblique'
  | 'Helvetica-BoldOblique'
  | 'Times-Roman'
  | 'Times-Bold'
  | 'Times-Italic'
  | 'Times-BoldItalic'
  | 'Courier'
  | 'Courier-Bold'
  | 'Courier-Oblique'
  | 'Courier-BoldOblique';

export type FontSource =
  | { kind: 'standard'; name: StandardFontName }
  | { kind: 'asset'; assetId: string };

export interface FontSpec {
  /** Key referenced by TextStyle.font, e.g. 'body', 'body-bold'. */
  family: string;
  source: FontSource;
}

export interface TextStyle {
  /** FontSpec.family key. */
  font: string;
  size: number;
  /** Hex color, '#rrggbb'. */
  color: string;
  align?: 'left' | 'center' | 'right';
  /** Line height multiplier. Default 1.3. */
  lineHeight?: number;
}

export type ScalarType =
  | 'string'
  | 'number'
  | 'currency'
  | 'date'
  | 'boolean'
  | 'image-url';

/**
 * How a bound value is turned into text. `pattern` meaning depends on type:
 * currency → ISO code (default 'MXN'); date → Intl dateStyle
 * ('full' | 'long' | 'medium' | 'short'); number → 'int' for whole numbers;
 * any type → 'custom:<name>' to use a host-registered formatter.
 */
export interface ValueFormat {
  type: ScalarType;
  pattern?: string;
}

interface ElementBase {
  id: string;
  scope: PageScope;
  frame: Frame;
}

/** A dynamic value bound to a dot-path in the render data. */
export interface FieldElement extends ElementBase {
  kind: 'field';
  /** Dot path into the data object, e.g. 'customer.name'. */
  binding: string;
  style: TextStyle;
  format?: ValueFormat;
}

/** Static text; supports {{dot.path}} interpolation. */
export interface TextElement extends ElementBase {
  kind: 'text';
  content: string;
  style: TextStyle;
}

export interface ImageElement extends ElementBase {
  kind: 'image';
  /** Static asset reference (logos)... */
  assetId?: string;
  /** ...or a binding whose value is an image URL / asset id. */
  binding?: string;
  fit: 'contain' | 'stretch';
}

export interface LineElement extends ElementBase {
  kind: 'line';
  direction: 'h' | 'v';
  thickness: number;
  color: string;
}

export type TemplateElement =
  | FieldElement
  | TextElement
  | ImageElement
  | LineElement;

/** Vertical band a flow stack lays out into. yTop < yBottom (top-down). */
export interface FlowRegion {
  x: number;
  yTop: number;
  yBottom: number;
  width: number;
}

export interface TableColumn {
  /** Dot path into each list item. */
  itemKey: string;
  label: string;
  width: number | 'flex';
  align?: 'left' | 'center' | 'right';
  format?: ValueFormat;
  /** Overrides the table's row style for this column. */
  style?: TextStyle;
}

export interface TableFooterRow {
  label: string;
  /** Dot path into the data object (not the list item), e.g. 'totals.total'. */
  binding: string;
  format?: ValueFormat;
  labelStyle: TextStyle;
  valueStyle: TextStyle;
}

export interface TableFlowItem {
  id: string;
  kind: 'table';
  /** Dot path to an array in the data object. */
  binding: string;
  columns: TableColumn[];
  header: {
    height: number;
    repeatOnContinuation: boolean;
    style: TextStyle;
    background?: string;
  };
  row: {
    minHeight: number;
    /** Horizontal cell inset (also the wrap width reduction). */
    padding: number;
    /** Vertical cell inset; defaults to `padding`. */
    paddingY?: number;
    style: TextStyle;
    divider?: { color: string; thickness: number };
  };
  /** Totals block; kept together, never split from itself. */
  footer?: { rows: TableFooterRow[]; rowGap?: number };
}

export interface TextBlockFlowItem {
  id: string;
  kind: 'text-block';
  /** Bound string value... */
  binding?: string;
  /** ...or static content with {{dot.path}} interpolation. */
  content?: string;
  style: TextStyle;
  justify?: boolean;
  spacingAfter?: number;
}

export interface ImageBlockFlowItem {
  id: string;
  kind: 'image-block';
  binding?: string;
  assetId?: string;
  maxHeight: number;
  align?: 'left' | 'center' | 'right';
  spacingAfter?: number;
}

export interface SpacerFlowItem {
  id: string;
  kind: 'spacer';
  height: number;
}

export type FlowItem =
  | TableFlowItem
  | TextBlockFlowItem
  | ImageBlockFlowItem
  | SpacerFlowItem;

export interface FlowSpec {
  regions: {
    /** Flow area on the first page. */
    first: FlowRegion;
    /** Flow area on continuation pages (usually taller — smaller header). */
    middle: FlowRegion;
  };
  stack: FlowItem[];
}

export interface BackgroundRef {
  assetId: string;
  /** Page of the background PDF to clone (0-based). */
  pageIndex: number;
}

export interface Template {
  schemaVersion: number;
  id: string;
  name: string;
  docType: DocType;
  pageSize: PageSize;
  /** Reference margins shown as dashed lines in the editor. */
  margins?: Margins;
  /** BCP-47 locale driving Intl formatting. */
  locale: string;
  /** ModelDescriptor.name this template binds to, if any. */
  model?: string;
  fonts: FontSpec[];
  background?: Partial<Record<'first' | 'middle' | 'last', BackgroundRef>>;
  elements: TemplateElement[];
  /** Absent → single-page stamping template. */
  flow?: FlowSpec;
}
