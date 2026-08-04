import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type {
  Margins,
  ModelDescriptor,
  PageScope,
  TemplateElement,
  TextStyle
} from '../core';
import { StyleFields } from './fields';
import { useEditor } from './store';

/** Per-layout background PDF: own, inherited from an earlier layout, or none. */
function BackgroundSettings({
  onAssetUpload
}: {
  onAssetUpload?: (file: File) => Promise<{ assetId: string }>;
}) {
  const tab = useEditor(s => s.scopeTab);
  const background = useEditor(s => s.template.background);
  const patchTemplate = useEditor(s => s.patchTemplate);
  const [uploading, setUploading] = useState(false);

  const own = background?.[tab];
  const inheritedFrom = own
    ? null
    : tab === 'middle' && background?.first
      ? 'la primera página'
      : tab === 'last' && (background?.middle || background?.first)
        ? background?.middle
          ? 'las páginas intermedias'
          : 'la primera página'
        : null;

  const tabLabel =
    tab === 'first' ? 'primera' : tab === 'middle' ? 'intermedias' : 'última';

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onAssetUpload) return;
    setUploading(true);
    try {
      const { assetId } = await onAssetUpload(file);
      patchTemplate({
        background: { ...background, [tab]: { assetId, pageIndex: 0 } }
      });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const remove = () => {
    const next = { ...background };
    delete next[tab];
    patchTemplate({
      background: Object.keys(next).length > 0 ? next : undefined
    });
  };

  return (
    <section className="pde-bg-settings">
      <div className="pde-props__header">
        <h3 className="pde-panel__title">Fondo de página ({tabLabel})</h3>
        {own && (
          <button type="button" className="pde-btn pde-btn--danger" onClick={remove}>
            Quitar
          </button>
        )}
      </div>
      <p className="pde-props__empty">
        {own
          ? 'Esta página usa su propio PDF de fondo.'
          : inheritedFrom
            ? `Usa el fondo de ${inheritedFrom}.`
            : 'Sin fondo. El PDF se genera sobre página blanca.'}
      </p>
      {onAssetUpload && (
        <label className="pde-field">
          <span>{own ? 'Reemplazar PDF de fondo' : 'Subir PDF de fondo'}</span>
          <input
            type="file"
            accept="application/pdf"
            disabled={uploading}
            onChange={upload}
          />
        </label>
      )}
    </section>
  );
}

const PT_PER_CM = 72 / 2.54;

/** Edits a point-value margin displayed in centimeters. */
function CmField({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange(next: number): void;
}) {
  return (
    <label className="pde-field">
      <span>{label}</span>
      <div className="pde-field__unit">
        <input
          type="number"
          value={Number((value / PT_PER_CM).toFixed(2))}
          step={0.1}
          min={0}
          onChange={e => {
            const n = Number(e.target.value);
            if (!isNaN(n) && n >= 0) onChange(n * PT_PER_CM);
          }}
        />
        <span>cm</span>
      </div>
    </label>
  );
}

/** Reference margins: dashed lines on the canvas, never printed. */
function MarginSettings() {
  const margins = useEditor(s => s.template.margins);
  const patchTemplate = useEditor(s => s.patchTemplate);
  const showMargins = useEditor(s => s.showMargins);
  const setShowMargins = useEditor(s => s.setShowMargins);

  const patch = (p: Partial<Margins>) => {
    if (margins) patchTemplate({ margins: { ...margins, ...p } });
  };

  if (!margins) {
    return (
      <section className="pde-margin-settings">
        <h3 className="pde-panel__title">Márgenes del documento</h3>
        <p className="pde-props__empty">
          Líneas punteadas de referencia para posicionar elementos; no se
          imprimen.
        </p>
        <button
          type="button"
          className="pde-btn"
          onClick={() => {
            const m = 2.5 * PT_PER_CM;
            patchTemplate({ margins: { top: m, right: m, bottom: m, left: m } });
            setShowMargins(true);
          }}
        >
          Definir márgenes
        </button>
      </section>
    );
  }

  return (
    <section className="pde-margin-settings">
      <div className="pde-props__header">
        <h3 className="pde-panel__title">Márgenes del documento</h3>
        <button
          type="button"
          className="pde-btn pde-btn--danger"
          onClick={() => patchTemplate({ margins: undefined })}
        >
          Quitar
        </button>
      </div>
      <label className="pde-field pde-field--row">
        <input
          type="checkbox"
          checked={showMargins}
          onChange={e => setShowMargins(e.target.checked)}
        />
        <span>Mostrar en el lienzo</span>
      </label>
      <div className="pde-props__grid">
        <CmField label="Superior" value={margins.top} onChange={top => patch({ top })} />
        <CmField label="Inferior" value={margins.bottom} onChange={bottom => patch({ bottom })} />
        <CmField label="Izquierdo" value={margins.left} onChange={left => patch({ left })} />
        <CmField label="Derecho" value={margins.right} onChange={right => patch({ right })} />
      </div>
    </section>
  );
}

/** Numeric editing of the current tab's flow region (also draggable on canvas). */
function RegionSettings() {
  const tab = useEditor(s => s.scopeTab);
  const flow = useEditor(s => s.template.flow);
  const updateRegion = useEditor(s => s.updateRegion);
  const disableFlow = useEditor(s => s.disableFlow);

  if (!flow || tab === 'last') return null;
  const region = flow.regions[tab];

  return (
    <section className="pde-region-settings">
      <div className="pde-props__header">
        <h3 className="pde-panel__title">
          Área de contenido ({tab === 'first' ? 'primera' : 'intermedias'})
        </h3>
        <button type="button" className="pde-btn pde-btn--danger" onClick={disableFlow}>
          Quitar
        </button>
      </div>
      <div className="pde-props__grid">
        <NumberField label="X" value={region.x} onChange={x => updateRegion(tab, { x })} />
        <NumberField
          label="Ancho"
          value={region.width}
          onChange={width => updateRegion(tab, { width })}
        />
        <NumberField
          label="Y inicio"
          value={region.yTop}
          onChange={yTop => updateRegion(tab, { yTop })}
        />
        <NumberField
          label="Y fin"
          value={region.yBottom}
          onChange={yBottom => updateRegion(tab, { yBottom })}
        />
      </div>
    </section>
  );
}

interface Props {
  descriptor?: ModelDescriptor;
  onAssetUpload?: (file: File) => Promise<{ assetId: string }>;
}

const SCOPES: Array<{ value: PageScope; label: string }> = [
  { value: 'first', label: 'Primera página' },
  { value: 'middle', label: 'Páginas intermedias' },
  { value: 'last', label: 'Última página' },
  { value: 'all', label: 'Todas las páginas' }
];

function NumberField({
  label,
  value,
  onChange,
  step = 1
}: {
  label: string;
  value: number;
  onChange(next: number): void;
  step?: number;
}) {
  return (
    <label className="pde-field">
      <span>{label}</span>
      <input
        type="number"
        value={Number(value.toFixed(1))}
        step={step}
        onChange={e => {
          const n = Number(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
      />
    </label>
  );
}

export function PropertiesPanel({ descriptor, onAssetUpload }: Props) {
  const element = useEditor(s =>
    s.template.elements.find(el => el.id === s.selectedId)
  );
  const updateElement = useEditor(s => s.updateElement);
  const removeElement = useEditor(s => s.removeElement);
  const panelFocusNonce = useEditor(s => s.panelFocusNonce);
  const bindingRef = useRef<HTMLSelectElement | HTMLInputElement | null>(null);

  // Double-clicking a dynamic element on the canvas spotlights this control.
  useEffect(() => {
    if (panelFocusNonce > 0) bindingRef.current?.focus();
  }, [panelFocusNonce]);

  if (!element) {
    return (
      <aside className="pde-props">
        <p className="pde-props__empty">
          Selecciona un elemento para editar sus propiedades.
        </p>
        <MarginSettings />
        <BackgroundSettings onAssetUpload={onAssetUpload} />
        <RegionSettings />
      </aside>
    );
  }

  const patch = (p: Partial<TemplateElement>) => updateElement(element.id, p);
  const patchFrame = (p: Partial<TemplateElement['frame']>) =>
    patch({ frame: { ...element.frame, ...p } });
  const hasStyle = element.kind === 'field' || element.kind === 'text';
  const patchStyle = (p: Partial<TextStyle>) => {
    if (hasStyle) patch({ style: { ...element.style, ...p } } as Partial<TemplateElement>);
  };

  const uploadImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onAssetUpload) return;
    const { assetId } = await onAssetUpload(file);
    patch({ assetId, binding: undefined } as Partial<TemplateElement>);
  };

  return (
    <aside className="pde-props">
      <div className="pde-props__header">
        <h3 className="pde-panel__title">
          {element.kind === 'field'
            ? 'Campo'
            : element.kind === 'text'
              ? 'Texto'
              : element.kind === 'image'
                ? 'Imagen'
                : 'Línea'}
        </h3>
        <button
          type="button"
          className="pde-btn pde-btn--danger"
          onClick={() => removeElement(element.id)}
        >
          Eliminar
        </button>
      </div>

      <label className="pde-field">
        <span>Aparece en</span>
        <select
          value={element.scope}
          onChange={e => patch({ scope: e.target.value as PageScope })}
        >
          {SCOPES.map(s => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="pde-field pde-field--row">
        <input
          type="checkbox"
          checked={element.frame.anchor === 'bottom'}
          onChange={e =>
            patchFrame({ anchor: e.target.checked ? 'bottom' : undefined })
          }
        />
        <span title="El elemento se mantiene pegado al borde inferior de la página">
          Fijar al pie de página
        </span>
      </label>

      {element.kind === 'field' && (
        <label
          key={`binding-${panelFocusNonce}`}
          className={`pde-field ${panelFocusNonce > 0 ? 'pde-pulse' : ''}`}
        >
          <span>Campo del modelo — este texto viene de los datos</span>
          {descriptor ? (
            <select
              ref={el => {
                bindingRef.current = el;
              }}
              value={element.binding}
              onChange={e => {
                const field = descriptor.fields.find(
                  f => f.kind === 'scalar' && f.key === e.target.value
                );
                patch({
                  binding: e.target.value,
                  ...(field && field.kind === 'scalar'
                    ? { format: { type: field.type, pattern: field.format } }
                    : {})
                } as Partial<TemplateElement>);
              }}
            >
              {descriptor.fields
                .filter(f => f.kind === 'scalar')
                .map(f => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
            </select>
          ) : (
            <input
              ref={el => {
                bindingRef.current = el;
              }}
              value={element.binding}
              onChange={e => patch({ binding: e.target.value } as Partial<TemplateElement>)}
            />
          )}
        </label>
      )}

      {element.kind === 'text' && (
        <label className="pde-field">
          <span>Contenido ({'{{campo}}'} para interpolar)</span>
          <textarea
            rows={3}
            value={element.content}
            onChange={e => patch({ content: e.target.value } as Partial<TemplateElement>)}
          />
        </label>
      )}

      {hasStyle && <StyleFields style={element.style} onChange={patchStyle} />}

      {element.kind === 'image' && (
        <>
          <label className="pde-field">
            <span>Ajuste</span>
            <select
              value={element.fit}
              onChange={e => patch({ fit: e.target.value as 'contain' | 'stretch' } as Partial<TemplateElement>)}
            >
              <option value="contain">Contener (mantiene proporción)</option>
              <option value="stretch">Estirar</option>
            </select>
          </label>
          {onAssetUpload && (
            <label className="pde-field">
              <span>Subir imagen</span>
              <input type="file" accept="image/png,image/jpeg" onChange={uploadImage} />
            </label>
          )}
          {descriptor && (
            <label className="pde-field">
              <span>…o campo de imagen</span>
              <select
                value={element.binding ?? ''}
                onChange={e =>
                  patch({
                    binding: e.target.value || undefined,
                    ...(e.target.value ? { assetId: undefined } : {})
                  } as Partial<TemplateElement>)
                }
              >
                <option value="">(ninguno)</option>
                {descriptor.fields
                  .filter(f => f.kind === 'scalar' && f.type === 'image-url')
                  .map(f => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </>
      )}

      <details className="pde-advanced">
        <summary>Avanzado (posición exacta en puntos)</summary>
        <div className="pde-props__grid">
          <NumberField label="X" value={element.frame.x} onChange={x => patchFrame({ x })} />
          <NumberField label="Y" value={element.frame.y} onChange={y => patchFrame({ y })} />
          <NumberField label="Ancho" value={element.frame.width} onChange={width => patchFrame({ width })} />
          <NumberField label="Alto" value={element.frame.height} onChange={height => patchFrame({ height })} />
        </div>
      </details>

      {element.kind === 'line' && (
        <div className="pde-props__grid">
          <label className="pde-field">
            <span>Dirección</span>
            <select
              value={element.direction}
              onChange={e => patch({ direction: e.target.value as 'h' | 'v' } as Partial<TemplateElement>)}
            >
              <option value="h">Horizontal</option>
              <option value="v">Vertical</option>
            </select>
          </label>
          <NumberField
            label="Grosor"
            value={element.thickness}
            step={0.5}
            onChange={thickness => patch({ thickness } as Partial<TemplateElement>)}
          />
          <label className="pde-field">
            <span>Color</span>
            <input
              type="color"
              value={element.color}
              onChange={e => patch({ color: e.target.value } as Partial<TemplateElement>)}
            />
          </label>
        </div>
      )}
    </aside>
  );
}
