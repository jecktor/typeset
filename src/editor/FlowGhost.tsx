import {
  formatValue,
  getByPath,
  interpolate,
  type FlowItem,
  type ImageBlockFlowItem,
  type ModelDescriptor,
  type TableFlowItem
} from '../core';
import type { AssetsInput } from '../render';
import { useImagePreviewSrc } from './ElementBox';
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

function TableGhost({ item, descriptor }: { item: TableFlowItem; descriptor?: ModelDescriptor }) {
  const zoom = useEditor(s => s.zoom);
  const locale = useEditor(s => s.template.locale);
  const sample = descriptor?.sample ?? {};
  const listRaw = getByPath(sample, item.binding);
  const rows = Array.isArray(listRaw) ? listRaw.slice(0, GHOST_ROWS) : [];

  const fixed = item.columns.reduce(
    (a, c) => a + (typeof c.width === 'number' ? c.width : 0),
    0
  );
  const flexCount = item.columns.filter(c => c.width === 'flex').length;

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
        {item.columns.map((col, i) => (
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
          {item.columns.map((col, ci) => (
            <span
              key={ci}
              style={{
                flex: col.width === 'flex' ? 1 : `0 0 ${col.width * zoom}px`,
                textAlign: col.align ?? 'left'
              }}
            >
              {formatValue(getByPath(row, col.itemKey), col.format, locale)}
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
      return <TableGhost item={item} descriptor={descriptor} />;
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
