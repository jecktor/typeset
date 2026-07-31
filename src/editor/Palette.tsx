import type { DragEvent } from 'react';
import type { FlowItem, ModelDescriptor } from '../core';
import { DND_MIME } from './Canvas';
import {
  defaultImageBlock,
  defaultSpacer,
  defaultTableFor,
  defaultTextBlock
} from './flowDefaults';
import { useEditor, type PlacingSpec } from './store';

const onDragStart = (spec: PlacingSpec) => (e: DragEvent) => {
  e.dataTransfer.setData(DND_MIME, JSON.stringify(spec));
  e.dataTransfer.effectAllowed = 'copy';
};

interface Props {
  descriptor?: ModelDescriptor;
}

const STATIC_ITEMS: PlacingSpec[] = [
  { kind: 'text', label: 'Texto' },
  { kind: 'image', label: 'Imagen' },
  { kind: 'line', label: 'Línea' }
];

function flowItemLabel(item: FlowItem, descriptor?: ModelDescriptor): string {
  switch (item.kind) {
    case 'table': {
      const list = descriptor?.fields.find(
        f => f.kind === 'list' && f.key === item.binding
      );
      return `Tabla · ${list?.label ?? item.binding}`;
    }
    case 'text-block':
      return item.binding ? `Texto · {${item.binding}}` : 'Bloque de texto';
    case 'image-block':
      return 'Imagen en flujo';
    case 'spacer':
      return `Espacio (${item.height}pt)`;
  }
}

export function Palette({ descriptor }: Props) {
  const placing = useEditor(s => s.placing);
  const setPlacing = useEditor(s => s.setPlacing);
  const template = useEditor(s => s.template);
  const flow = useEditor(s => s.template.flow);
  const selectedFlowId = useEditor(s => s.selectedFlowId);
  const selectFlowItem = useEditor(s => s.selectFlowItem);
  const enableFlow = useEditor(s => s.enableFlow);
  const addFlowItem = useEditor(s => s.addFlowItem);
  const moveFlowItem = useEditor(s => s.moveFlowItem);

  const toggle = (spec: PlacingSpec) => {
    const isActive =
      placing && placing.kind === spec.kind && placing.binding === spec.binding;
    setPlacing(isActive ? null : spec);
  };

  const addList = (key: string) => {
    const field = descriptor?.fields.find(
      f => f.kind === 'list' && f.key === key
    );
    if (!field || field.kind !== 'list') return;
    if (!flow) enableFlow();
    addFlowItem(defaultTableFor(field, template));
  };

  return (
    <aside className="pde-palette">
      {descriptor && (
        <section>
          <h3 className="pde-panel__title">{descriptor.label}</h3>
          <div className="pde-palette__list">
            {descriptor.fields.map(field =>
              field.kind === 'scalar' ? (
                <button
                  key={field.key}
                  type="button"
                  draggable
                  onDragStart={onDragStart({
                    kind: 'field',
                    label: field.label,
                    binding: field.key,
                    format: { type: field.type, pattern: field.format }
                  })}
                  title="Arrastra el campo a la página, o haz clic y luego clic en la página"
                  className={`pde-chip ${
                    placing?.kind === 'field' && placing.binding === field.key
                      ? 'pde-chip--active'
                      : ''
                  }`}
                  onClick={() =>
                    toggle({
                      kind: 'field',
                      label: field.label,
                      binding: field.key,
                      format: { type: field.type, pattern: field.format }
                    })
                  }
                >
                  {field.label}
                </button>
              ) : (
                <button
                  key={field.key}
                  type="button"
                  className="pde-chip pde-chip--list"
                  title="Añade una tabla al flujo con las propiedades de esta lista"
                  onClick={() => addList(field.key)}
                >
                  {field.label} ⊞
                </button>
              )
            )}
          </div>
        </section>
      )}

      <section>
        <h3 className="pde-panel__title">Elementos</h3>
        <div className="pde-palette__list">
          {STATIC_ITEMS.map(item => (
            <button
              key={item.kind}
              type="button"
              draggable
              onDragStart={onDragStart(item)}
              title="Arrastra a la página, o haz clic y luego clic en la página"
              className={`pde-chip ${
                placing?.kind === item.kind ? 'pde-chip--active' : ''
              }`}
              onClick={() => toggle(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="pde-panel__title">Contenido del documento</h3>
        {!flow ? (
          <button type="button" className="pde-btn" onClick={enableFlow}>
            Añadir área de contenido
          </button>
        ) : (
          <>
            <div className="pde-stack">
              {flow.stack.length === 0 && (
                <p className="pde-props__empty">
                  Agrega una lista del modelo o un bloque al flujo.
                </p>
              )}
              {flow.stack.map((item, i) => (
                <div
                  key={item.id}
                  className={`pde-stack__item ${
                    selectedFlowId === item.id ? 'pde-stack__item--selected' : ''
                  }`}
                  onClick={() => selectFlowItem(item.id)}
                >
                  <span className="pde-stack__label">
                    {i + 1}. {flowItemLabel(item, descriptor)}
                  </span>
                  <span className="pde-stack__actions">
                    <button
                      type="button"
                      title="Subir"
                      disabled={i === 0}
                      onClick={e => {
                        e.stopPropagation();
                        moveFlowItem(item.id, -1);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title="Bajar"
                      disabled={i === flow.stack.length - 1}
                      onClick={e => {
                        e.stopPropagation();
                        moveFlowItem(item.id, 1);
                      }}
                    >
                      ↓
                    </button>
                  </span>
                </div>
              ))}
            </div>
            <div className="pde-palette__list" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="pde-chip"
                onClick={() => addFlowItem(defaultTextBlock(template))}
              >
                + Texto
              </button>
              <button
                type="button"
                className="pde-chip"
                onClick={() => addFlowItem(defaultImageBlock())}
              >
                + Imagen
              </button>
              <button
                type="button"
                className="pde-chip"
                onClick={() => addFlowItem(defaultSpacer())}
              >
                + Espacio
              </button>
            </div>
          </>
        )}
      </section>

      {placing && (
        <p className="pde-palette__hint">
          Haz clic en la página para colocar «{placing.label}». Esc para
          cancelar.
        </p>
      )}
    </aside>
  );
}
