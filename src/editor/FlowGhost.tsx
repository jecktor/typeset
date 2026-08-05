import {
  cellImageSource,
  DEFAULT_IMAGE_HEIGHT,
  formatValue,
  getByPath,
  interpolate,
  isImageColumn,
  visibleColumns,
  type FlowItem,
  type ImageBlockFlowItem,
  type ModelDescriptor,
  type TableColumn,
  type TableFlowItem
} from '../core';
import type { AssetsInput } from '../render';
import { useImagePreviewSrc } from './ElementBox';
import { useAssetUrl } from './useAssetUrl';
import { useEditor } from './store';

/**
 * Schematic preview of the flow stack inside the region, rendered with the
 * model's sample data so edit mode shows WHERE content will grow without
 * running the real renderer (preview mode does that).
 */
interface Props {
  descriptor?: ModelDescriptor;
  assets?: AssetsInput;
}

function ImageBlockGhost({
  item,
  descriptor,
  assets
}: {
  item: ImageBlockFlowItem;
  descriptor?: ModelDescriptor;
  assets?: AssetsInput;
}) {
  const zoom = useEditor(s => s.zoom);
  const src = useImagePreviewSrc(
    assets,
    item.assetId,
    item.binding,
    descriptor?.sample
  );
  if (!src) {
    return (
      <div
        className="pde-ghost__image"
        style={{ height: Math.min(item.maxHeight, 60) * zoom }}
      >
        🖼 {item.binding ? `{${item.binding}}` : 'Imagen'}
      </div>
    );
  }
  return (
    <div
      className="pde-ghost__imagepic"
      style={{
        height: item.maxHeight * zoom,
        justifyContent:
          item.align === 'left'
            ? 'flex-start'
            : item.align === 'right'
              ? 'flex-end'
              : 'center'
      }}
    >
      <img src={src} alt="" draggable={false} />
    </div>
  );
}

const GHOST_ROWS = 3;

/** One product picture in the schematic table — the row's own or the fallback. */
function TableImageCell({
  item,
  col,
  row,
  assets
}: {
  item: TableFlowItem;
  col: TableColumn;
  row: unknown;
  assets?: AssetsInput;
}) {
  const zoom = useEditor(s => s.zoom);
  const source = cellImageSource(row, col, item);
  const isDirectUrl = /^(https?:|data:|blob:)/.test(source);
  const resolved = useAssetUrl(assets, isDirectUrl ? undefined : source);
  const src = isDirectUrl ? source : resolved;
  const height = (col.imageHeight ?? DEFAULT_IMAGE_HEIGHT) * zoom;
  if (!src) return <span style={{ height }} />;
  return (
    <img
      className="pde-ghost__cellimg"
      src={src}
      alt=""
      draggable={false}
      style={{ maxHeight: height }}
    />
  );
}

function TableGhost({
  item,
  descriptor,
  assets
}: {
  item: TableFlowItem;
  descriptor?: ModelDescriptor;
  assets?: AssetsInput;
}) {
  const zoom = useEditor(s => s.zoom);
  const locale = useEditor(s => s.template.locale);
  const sample = descriptor?.sample ?? {};
  const listRaw = getByPath(sample, item.binding);
  const rows = Array.isArray(listRaw) ? listRaw.slice(0, GHOST_ROWS) : [];

  // Mirrors the renderer: with images off, image columns aren't there at all.
  const columns = visibleColumns(item);
  const fixed = columns.reduce(
    (a, c) => a + (typeof c.width === 'number' ? c.width : 0),
    0
  );
  const flexCount = columns.filter(c => c.width === 'flex').length;

  const widthOf = (w: number | 'flex', total: number) =>
    w === 'flex'
      ? `${Math.max(0, total - fixed) / Math.max(1, flexCount)}px`
      : `${w * zoom}px`;

  return (
    <div className="pde-ghost__table">
      <div
        className="pde-ghost__thead"
        style={{
          background: item.header.background ?? '#f2f2f2',
          height: item.header.height * zoom,
          fontSize: item.header.style.size * zoom
        }}
      >
        {columns.map((col, i) => (
          <span
            key={i}
            style={{
              flex: col.width === 'flex' ? 1 : `0 0 ${col.width * zoom}px`,
              textAlign: col.align ?? 'left'
            }}
          >
            {col.label}
          </span>
        ))}
      </div>
      {rows.map((row, ri) => (
        <div
          key={ri}
          className="pde-ghost__tr"
          style={{ fontSize: item.row.style.size * zoom }}
        >
          {columns.map((col, ci) => (
            <span
              key={ci}
              style={{
                flex: col.width === 'flex' ? 1 : `0 0 ${col.width * zoom}px`,
                textAlign: col.align ?? 'left'
              }}
            >
              {isImageColumn(col) ? (
                <TableImageCell item={item} col={col} row={row} assets={assets} />
              ) : (
                formatValue(getByPath(row, col.itemKey), col.format, locale)
              )}
            </span>
          ))}
        </div>
      ))}
      <div className="pde-ghost__more" style={{ fontSize: 10 * zoom }}>
        ⋯ la tabla crece con los datos ⋯
      </div>
    </div>
  );
}

function ItemGhost({
  item,
  descriptor,
  assets
}: {
  item: FlowItem;
  descriptor?: ModelDescriptor;
  assets?: AssetsInput;
}) {
  const zoom = useEditor(s => s.zoom);
  const locale = useEditor(s => s.template.locale);
  const sample = descriptor?.sample ?? {};

  switch (item.kind) {
    case 'table':
      return <TableGhost item={item} descriptor={descriptor} assets={assets} />;
    case 'text-block': {
      const text = item.binding
        ? String(getByPath(sample, item.binding) ?? `{${item.binding}}`)
        : interpolate(item.content ?? '', p => getByPath(sample, p), locale);
      return (
        <div
          className="pde-ghost__text"
          style={{
            fontSize: item.style.size * zoom,
            lineHeight: item.style.lineHeight ?? 1.3,
            textAlign: item.justify ? 'justify' : (item.style.align ?? 'left')
          }}
        >
          {text}
        </div>
      );
    }
    case 'image-block':
      return <ImageBlockGhost item={item} descriptor={descriptor} assets={assets} />;
    case 'spacer':
      return <div style={{ height: item.height * zoom }} />;
  }
}

export function FlowGhost({ descriptor, assets }: Props) {
  const stack = useEditor(s => s.template.flow?.stack) ?? [];
  const selectedFlowId = useEditor(s => s.selectedFlowId);
  const selectFlowItem = useEditor(s => s.selectFlowItem);
  const requestPanelFocus = useEditor(s => s.requestPanelFocus);

  return (
    <div className="pde-ghost">
      {stack.length === 0 && (
        <div className="pde-ghost__empty">
          Agrega aquí la tabla de la lista (p. ej. «Partidas ⊞») o bloques de
          texto desde «Contenido del documento».
        </div>
      )}
      {stack.map(item => (
        <div
          key={item.id}
          className={`pde-ghost__item ${
            selectedFlowId === item.id ? 'pde-ghost__item--selected' : ''
          }`}
          onClick={e => {
            e.stopPropagation();
            selectFlowItem(item.id);
          }}
          onDoubleClick={e => {
            e.stopPropagation();
            selectFlowItem(item.id);
            requestPanelFocus();
          }}
        >
          <ItemGhost item={item} descriptor={descriptor} assets={assets} />
        </div>
      ))}
    </div>
  );
}
