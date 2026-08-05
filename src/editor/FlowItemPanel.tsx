import { useEffect, useRef, type ChangeEvent } from 'react';
import {
  DEFAULT_IMAGE_COLUMN_WIDTH,
  DEFAULT_IMAGE_HEIGHT,
  isImageColumn,
  PLACEHOLDER_IMAGE_ASSET,
  tableShowsImages,
  type ListFieldDescriptor,
  type ModelDescriptor,
  type TableColumn,
  type TableFlowItem,
  type ValueFormat
} from '../core';
import type { AssetsInput } from '../render';
import { CheckboxField, NumberField, SelectField, StyleFields } from './fields';
import { useEditorStrings } from './strings';
import { useAssetUrl } from './useAssetUrl';
import { useEditor } from './store';

interface Props {
  descriptor?: ModelDescriptor;
  assets?: AssetsInput;
  onAssetUpload?: (file: File) => Promise<{ assetId: string }>;
}

const FORMAT_TYPES: Array<{ value: ValueFormat['type']; label: string }> = [
  { value: 'string', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'currency', label: 'Moneda' },
  { value: 'date', label: 'Fecha' },
  { value: 'boolean', label: 'Sí/No' }
];

/** Preview of the picture rows fall back to — the author's or the built-in. */
function FallbackImagePreview({
  assetId,
  assets
}: {
  assetId?: string;
  assets?: AssetsInput;
}) {
  const src = useAssetUrl(assets, assetId || PLACEHOLDER_IMAGE_ASSET);
  if (!src) return null;
  return <img className="pde-fallback-image" src={src} alt="" draggable={false} />;
}

function TableEditor({
  item,
  descriptor,
  assets,
  onAssetUpload
}: {
  item: TableFlowItem;
  descriptor?: ModelDescriptor;
  assets?: AssetsInput;
  onAssetUpload?: Props['onAssetUpload'];
}) {
  const strings = useEditorStrings();
  const updateFlowItem = useEditor(s => s.updateFlowItem);
  const scalars =
    descriptor?.fields.filter(f => f.kind === 'scalar') ?? [];
  const lists = (descriptor?.fields.filter(f => f.kind === 'list') ??
    []) as ListFieldDescriptor[];
  const currentList = lists.find(l => l.key === item.binding);
  const imageFields =
    currentList?.itemFields.filter(f => f.type === 'image-url') ?? [];
  const showsImages = tableShowsImages(item);
  const hasImageColumn = item.columns.some(isImageColumn);

  const patch = (p: Partial<TableFlowItem>) => updateFlowItem(item.id, p);
  const patchColumn = (i: number, p: Partial<TableColumn>) =>
    patch({
      columns: item.columns.map((c, ci) => (ci === i ? { ...c, ...p } : c))
    });
  const patchImages = (p: Partial<NonNullable<TableFlowItem['images']>>) =>
    patch({ images: { enabled: showsImages, ...item.images, ...p } });

  /** Column order is left-to-right in the table; earlier card = earlier column. */
  const moveColumn = (i: number, direction: -1 | 1) => {
    const target = i + direction;
    if (target < 0 || target >= item.columns.length) return;
    const columns = [...item.columns];
    [columns[i], columns[target]] = [columns[target]!, columns[i]!];
    patch({ columns });
  };

  /** Turning a column into a picture: keep what the author set, fill the rest. */
  const asImageColumn = (col: TableColumn): Partial<TableColumn> => ({
    kind: 'image',
    format: undefined,
    // A text column's alignment was chosen for text ('left' for prose, 'right'
    // for money) and means nothing to a thumbnail, so a fresh conversion
    // centres. An existing image column keeps whatever it was given.
    align: isImageColumn(col) ? col.align : 'center',
    width: col.width === 'flex' ? DEFAULT_IMAGE_COLUMN_WIDTH : col.width,
    imageHeight: col.imageHeight ?? DEFAULT_IMAGE_HEIGHT
  });

  return (
    <>
      {lists.length > 0 && (
        <SelectField
          label="Lista del modelo"
          value={item.binding}
          options={lists.map(l => ({ value: l.key, label: l.label }))}
          onChange={binding => patch({ binding })}
        />
      )}

      <h4 className="pde-panel__title">Columnas</h4>
      <div className="pde-columns">
        {item.columns.map((col, i) => (
          <div key={i} className="pde-column-card">
            <div className="pde-column-card__head">
              <span className="pde-column-card__index">
                {i + 1}. {col.label || '—'}
              </span>
              <span className="pde-stack__actions">
                <button
                  type="button"
                  title={strings.columnMoveEarlier}
                  disabled={i === 0}
                  onClick={() => moveColumn(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  title={strings.columnMoveLater}
                  disabled={i === item.columns.length - 1}
                  onClick={() => moveColumn(i, 1)}
                >
                  ↓
                </button>
              </span>
            </div>
            <div className="pde-props__grid">
              <label className="pde-field">
                <span>Título</span>
                <input
                  value={col.label}
                  onChange={e => patchColumn(i, { label: e.target.value })}
                />
              </label>
              {currentList ? (
                <SelectField
                  label="Campo"
                  value={col.itemKey}
                  options={currentList.itemFields.map(f => ({
                    value: f.key,
                    label: f.label
                  }))}
                  onChange={itemKey => {
                    const f = currentList.itemFields.find(x => x.key === itemKey);
                    // Picking a picture field turns the column into a picture.
                    if (f?.type === 'image-url') {
                      patchColumn(i, { itemKey, ...asImageColumn(col) });
                      return;
                    }
                    patchColumn(i, {
                      itemKey,
                      ...(f ? { format: { type: f.type, pattern: f.format } } : {}),
                      ...(isImageColumn(col) ? { kind: 'text' as const } : {})
                    });
                  }}
                />
              ) : (
                <label className="pde-field">
                  <span>Campo</span>
                  <input
                    value={col.itemKey}
                    onChange={e => patchColumn(i, { itemKey: e.target.value })}
                  />
                </label>
              )}
            </div>
            <label className="pde-field">
              <span>Ancho</span>
              <div className="pde-width-input">
                <input
                  type="number"
                  disabled={col.width === 'flex'}
                  value={col.width === 'flex' ? '' : col.width}
                  placeholder="auto"
                  onChange={e => {
                    const n = Number(e.target.value);
                    if (!isNaN(n) && n > 0) patchColumn(i, { width: n });
                  }}
                />
                <label title="La columna ocupa el espacio restante">
                  <input
                    type="checkbox"
                    checked={col.width === 'flex'}
                    onChange={e =>
                      patchColumn(i, { width: e.target.checked ? 'flex' : 90 })
                    }
                  />
                  Automático
                </label>
              </div>
            </label>
            <div className="pde-props__grid">
              <SelectField
                label="Alineación"
                value={col.align ?? 'left'}
                options={[
                  { value: 'left', label: 'Izquierda' },
                  { value: 'center', label: 'Centro' },
                  { value: 'right', label: 'Derecha' }
                ]}
                onChange={align =>
                  patchColumn(i, { align: align as TableColumn['align'] })
                }
              />
              <SelectField
                label={strings.columnContent}
                value={isImageColumn(col) ? 'image' : 'text'}
                options={[
                  { value: 'text', label: strings.columnContentText },
                  { value: 'image', label: strings.columnContentImage }
                ]}
                onChange={kind =>
                  patchColumn(
                    i,
                    kind === 'image' ? asImageColumn(col) : { kind: 'text' }
                  )
                }
              />
            </div>
            {isImageColumn(col) ? (
              <NumberField
                label={strings.columnImageHeight}
                value={col.imageHeight ?? DEFAULT_IMAGE_HEIGHT}
                onChange={imageHeight => patchColumn(i, { imageHeight })}
              />
            ) : (
              <SelectField
                label="Formato"
                value={col.format?.type ?? 'string'}
                options={FORMAT_TYPES}
                onChange={type =>
                  patchColumn(i, {
                    format: { ...col.format, type: type as ValueFormat['type'] }
                  })
                }
              />
            )}
            <button
              type="button"
              className="pde-btn pde-btn--danger pde-column-card__remove"
              onClick={() =>
                patch({ columns: item.columns.filter((_, ci) => ci !== i) })
              }
            >
              Quitar
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="pde-btn"
        onClick={() =>
          patch({
            columns: [
              ...item.columns,
              {
                itemKey: currentList?.itemFields[0]?.key ?? '',
                label: 'Columna',
                width: 'flex',
                align: 'left'
              }
            ]
          })
        }
      >
        + Añadir columna
      </button>
      <button
        type="button"
        className="pde-btn"
        onClick={() =>
          patch({
            columns: [
              ...item.columns,
              {
                itemKey: imageFields[0]?.key ?? currentList?.itemFields[0]?.key ?? '',
                label: strings.imageColumnLabel,
                width: DEFAULT_IMAGE_COLUMN_WIDTH,
                align: 'center',
                kind: 'image',
                imageHeight: DEFAULT_IMAGE_HEIGHT
              }
            ],
            // Adding a picture column is intent enough to switch images on.
            images: { ...item.images, enabled: true }
          })
        }
      >
        {strings.addImageColumn}
      </button>

      <h4 className="pde-panel__title">{strings.tableImagesTitle}</h4>
      <CheckboxField
        label={strings.tableIncludeImages}
        checked={showsImages}
        onChange={enabled => patchImages({ enabled })}
      />
      <small className="pde-field__hint">{strings.tableIncludeImagesHint}</small>
      {showsImages && !hasImageColumn && (
        <small className="pde-field__hint">{strings.tableNoImageColumn}</small>
      )}
      {showsImages && (
        <div className="pde-fallback">
          <FallbackImagePreview
            assetId={item.images?.fallbackAssetId}
            assets={assets}
          />
          <div className="pde-fallback__body">
            {onAssetUpload ? (
              <label className="pde-field">
                <span>{strings.tableFallbackImage}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const { assetId } = await onAssetUpload(file);
                    patchImages({ fallbackAssetId: assetId });
                  }}
                />
              </label>
            ) : (
              <span className="pde-field__hint">{strings.tableFallbackImage}</span>
            )}
            <small className="pde-field__hint">
              {strings.tableFallbackImageHint}
            </small>
            {item.images?.fallbackAssetId && (
              <button
                type="button"
                className="pde-btn"
                onClick={() => patchImages({ fallbackAssetId: undefined })}
              >
                {strings.tableFallbackImageReset}
              </button>
            )}
          </div>
        </div>
      )}

      <h4 className="pde-panel__title">Encabezado</h4>
      <div className="pde-props__grid">
        <NumberField
          label="Altura"
          value={item.header.height}
          onChange={height => patch({ header: { ...item.header, height } })}
        />
        <label className="pde-field">
          <span>Fondo</span>
          <input
            type="color"
            value={item.header.background ?? '#f2f2f2'}
            onChange={e =>
              patch({ header: { ...item.header, background: e.target.value } })
            }
          />
        </label>
      </div>
      <CheckboxField
        label="Repetir encabezado en páginas siguientes"
        checked={item.header.repeatOnContinuation}
        onChange={repeatOnContinuation =>
          patch({ header: { ...item.header, repeatOnContinuation } })
        }
      />

      <h4 className="pde-panel__title">Filas</h4>
      <div className="pde-props__grid">
        <NumberField
          label="Altura mín."
          value={item.row.minHeight}
          onChange={minHeight => patch({ row: { ...item.row, minHeight } })}
        />
        <NumberField
          label="Margen interno"
          value={item.row.padding}
          onChange={padding => patch({ row: { ...item.row, padding } })}
        />
      </div>
      <StyleFields
        style={item.row.style}
        withAlign={false}
        onChange={p => patch({ row: { ...item.row, style: { ...item.row.style, ...p } } })}
      />

      <h4 className="pde-panel__title">Totales (al final de la tabla)</h4>
      {(item.footer?.rows ?? []).map((row, i) => (
        <div key={i} className="pde-props__grid">
          <label className="pde-field">
            <span>Etiqueta</span>
            <input
              value={row.label}
              onChange={e => {
                const rows = [...item.footer!.rows];
                rows[i] = { ...row, label: e.target.value };
                patch({ footer: { ...item.footer!, rows } });
              }}
            />
          </label>
          <SelectField
            label="Campo"
            value={row.binding}
            options={scalars.map(f => ({ value: f.key, label: f.label }))}
            onChange={binding => {
              const f = scalars.find(x => x.key === binding);
              const rows = [...item.footer!.rows];
              rows[i] = {
                ...row,
                binding,
                ...(f && f.kind === 'scalar'
                  ? { format: { type: f.type, pattern: f.format } }
                  : {})
              };
              patch({ footer: { ...item.footer!, rows } });
            }}
          />
          <button
            type="button"
            className="pde-btn pde-btn--danger"
            onClick={() =>
              patch({
                footer: {
                  ...item.footer!,
                  rows: item.footer!.rows.filter((_, ri) => ri !== i)
                }
              })
            }
          >
            Quitar
          </button>
        </div>
      ))}
      <button
        type="button"
        className="pde-btn"
        onClick={() => {
          const first = scalars[0];
          patch({
            footer: {
              rows: [
                ...(item.footer?.rows ?? []),
                {
                  label: 'Total',
                  binding: first?.key ?? '',
                  format:
                    first && first.kind === 'scalar'
                      ? { type: first.type, pattern: first.format }
                      : { type: 'currency' },
                  labelStyle: { ...item.row.style },
                  valueStyle: { ...item.row.style }
                }
              ]
            }
          });
        }}
      >
        + Añadir total
      </button>
    </>
  );
}

export function FlowItemPanel({ descriptor, assets, onAssetUpload }: Props) {
  const item = useEditor(s =>
    s.template.flow?.stack.find(it => it.id === s.selectedFlowId)
  );
  const updateFlowItem = useEditor(s => s.updateFlowItem);
  const removeFlowItem = useEditor(s => s.removeFlowItem);
  const panelFocusNonce = useEditor(s => s.panelFocusNonce);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  // Double-clicking a ghost block on the canvas spotlights its content field.
  useEffect(() => {
    if (panelFocusNonce > 0) contentRef.current?.focus();
  }, [panelFocusNonce]);

  if (!item) return null;

  const scalars = descriptor?.fields.filter(f => f.kind === 'scalar') ?? [];

  const uploadImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onAssetUpload) return;
    const { assetId } = await onAssetUpload(file);
    updateFlowItem(item.id, { assetId, binding: undefined } as never);
  };

  return (
    <aside className="pde-props">
      <div className="pde-props__header">
        <h3 className="pde-panel__title">
          {item.kind === 'table'
            ? 'Tabla'
            : item.kind === 'text-block'
              ? 'Bloque de texto'
              : item.kind === 'image-block'
                ? 'Imagen en flujo'
                : 'Espaciador'}
        </h3>
        <button
          type="button"
          className="pde-btn pde-btn--danger"
          onClick={() => removeFlowItem(item.id)}
        >
          Eliminar
        </button>
      </div>

      {item.kind === 'table' && (
        <TableEditor
          item={item}
          descriptor={descriptor}
          assets={assets}
          onAssetUpload={onAssetUpload}
        />
      )}

      {item.kind === 'text-block' && (
        <>
          <SelectField
            label="Campo del modelo (opcional)"
            value={item.binding ?? ''}
            options={[
              { value: '', label: '(texto fijo)' },
              ...scalars.map(f => ({ value: f.key, label: f.label }))
            ]}
            onChange={binding =>
              updateFlowItem(item.id, { binding: binding || undefined } as never)
            }
          />
          {!item.binding && (
            <label
              key={`content-${panelFocusNonce}`}
              className={`pde-field ${panelFocusNonce > 0 ? 'pde-pulse' : ''}`}
            >
              <span>Contenido ({'{{campo}}'} para interpolar)</span>
              <textarea
                ref={contentRef}
                rows={3}
                value={item.content ?? ''}
                onChange={e =>
                  updateFlowItem(item.id, { content: e.target.value } as never)
                }
              />
            </label>
          )}
          <StyleFields
            style={item.style}
            onChange={p =>
              updateFlowItem(item.id, { style: { ...item.style, ...p } } as never)
            }
          />
          <CheckboxField
            label="Justificar párrafos"
            checked={item.justify ?? false}
            onChange={justify => updateFlowItem(item.id, { justify } as never)}
          />
          <NumberField
            label="Espacio después"
            value={item.spacingAfter ?? 0}
            onChange={spacingAfter =>
              updateFlowItem(item.id, { spacingAfter } as never)
            }
          />
        </>
      )}

      {item.kind === 'image-block' && (
        <>
          {onAssetUpload && (
            <label className="pde-field">
              <span>Subir imagen</span>
              <input type="file" accept="image/png,image/jpeg" onChange={uploadImage} />
            </label>
          )}
          <SelectField
            label="…o campo de imagen"
            value={item.binding ?? ''}
            options={[
              { value: '', label: '(ninguno)' },
              ...scalars
                .filter(f => f.kind === 'scalar' && f.type === 'image-url')
                .map(f => ({ value: f.key, label: f.label }))
            ]}
            onChange={binding =>
              updateFlowItem(item.id, {
                binding: binding || undefined,
                ...(binding ? { assetId: undefined } : {})
              } as never)
            }
          />
          <div className="pde-props__grid">
            <NumberField
              label="Alto máx."
              value={item.maxHeight}
              onChange={maxHeight => updateFlowItem(item.id, { maxHeight } as never)}
            />
            <SelectField
              label="Alineación"
              value={item.align ?? 'center'}
              options={[
                { value: 'left', label: 'Izquierda' },
                { value: 'center', label: 'Centro' },
                { value: 'right', label: 'Derecha' }
              ]}
              onChange={align => updateFlowItem(item.id, { align } as never)}
            />
          </div>
        </>
      )}

      {item.kind === 'spacer' && (
        <NumberField
          label="Altura"
          value={item.height}
          onChange={height => updateFlowItem(item.id, { height } as never)}
        />
      )}
    </aside>
  );
}
