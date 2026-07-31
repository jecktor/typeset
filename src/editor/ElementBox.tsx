import {
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent
} from 'react';
import {
  formatValue,
  getByPath,
  interpolate,
  type ImageElement,
  type ModelDescriptor,
  type TemplateElement,
  type TextElement
} from '../core';
import type { AssetsInput } from '../render';
import { frameToRect, type ResizeCorner } from './geometry';
import { useAssetUrl } from './useAssetUrl';
import { useEditor } from './store';

/** Resolve what an image element/block would show: uploaded asset, a URL from
 *  the sample data, or nothing (placeholder). */
export function useImagePreviewSrc(
  assets: AssetsInput | undefined,
  assetId: string | undefined,
  binding: string | undefined,
  sample: Record<string, unknown> | undefined
): string | null {
  const bound = binding ? getByPath(sample ?? {}, binding) : undefined;
  const boundStr = typeof bound === 'string' && bound ? bound : undefined;
  const isDirectUrl = !!boundStr && /^(https?:|data:|blob:)/.test(boundStr);
  const resolved = useAssetUrl(
    assets,
    assetId ?? (isDirectUrl ? undefined : boundStr)
  );
  if (assetId) return resolved;
  if (isDirectUrl) return boundStr;
  return resolved;
}

function ImagePreview({
  element,
  descriptor,
  assets
}: {
  element: ImageElement;
  descriptor?: ModelDescriptor;
  assets?: AssetsInput;
}) {
  const src = useImagePreviewSrc(
    assets,
    element.assetId,
    element.binding,
    descriptor?.sample
  );
  if (!src) {
    return (
      <div className="pde-box__image-label">
        {element.binding ? `🖼 {${element.binding}}` : '🖼 sin imagen'}
      </div>
    );
  }
  return (
    <img
      className="pde-box__img"
      src={src}
      alt=""
      draggable={false}
      style={{ objectFit: element.fit === 'stretch' ? 'fill' : 'contain' }}
    />
  );
}

const CORNERS: ResizeCorner[] = ['nw', 'ne', 'sw', 'se'];

interface Props {
  element: TemplateElement;
  descriptor?: ModelDescriptor;
  assets?: AssetsInput;
  onStartMove(e: PointerEvent, id: string): void;
  onStartResize(e: PointerEvent, id: string, corner: ResizeCorner): void;
}

function previewText(
  element: TemplateElement,
  descriptor: ModelDescriptor | undefined,
  locale: string
): string {
  const sample = descriptor?.sample ?? {};
  if (element.kind === 'field') {
    const value = getByPath(sample, element.binding);
    const text = formatValue(value, element.format, locale);
    return text || `{${element.binding}}`;
  }
  if (element.kind === 'text') {
    return interpolate(element.content, p => getByPath(sample, p), locale);
  }
  return '';
}

/** In-place editor for static text elements (Enter commits, Esc cancels). */
function InlineTextEditor({ element }: { element: TextElement }) {
  const zoom = useEditor(s => s.zoom);
  const updateElement = useEditor(s => s.updateElement);
  const setEditing = useEditor(s => s.setEditing);
  const cancelled = useRef(false);

  const commit = (target: HTMLTextAreaElement) => {
    // Capture the root before the textarea unmounts, then hand focus back so
    // keyboard shortcuts (Ctrl+Z, Delete) keep working after the edit.
    const root = target.closest('.pde-root') as HTMLElement | null;
    if (!cancelled.current && target.value !== element.content) {
      updateElement(element.id, { content: target.value });
    }
    setEditing(null);
    root?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      (e.target as HTMLTextAreaElement).blur();
    }
    if (e.key === 'Escape') {
      cancelled.current = true;
      (e.target as HTMLTextAreaElement).blur();
    }
  };

  return (
    <textarea
      className="pde-box__editarea"
      autoFocus
      defaultValue={element.content}
      onFocus={e => e.target.select()}
      onBlur={e => commit(e.target)}
      onKeyDown={onKeyDown}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        fontSize: element.style.size * zoom,
        color: element.style.color,
        textAlign: element.style.align ?? 'left',
        lineHeight: element.style.lineHeight ?? 1.3,
        fontWeight: element.style.font.includes('bold') ? 600 : 400,
        fontStyle: element.style.font.includes('italic') ? 'italic' : 'normal'
      }}
    />
  );
}

export function ElementBox({ element, descriptor, assets, onStartMove, onStartResize }: Props) {
  const zoom = useEditor(s => s.zoom);
  const pageHeight = useEditor(s => s.template.pageSize.height);
  const locale = useEditor(s => s.template.locale);
  const selected = useEditor(s => s.selectedId === element.id);
  const editing = useEditor(s => s.editingId === element.id);
  const setEditing = useEditor(s => s.setEditing);
  const select = useEditor(s => s.select);
  const requestPanelFocus = useEditor(s => s.requestPanelFocus);

  const rect = frameToRect(element.frame, pageHeight);
  const isLine = element.kind === 'line';

  const onDoubleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (element.kind === 'text') {
      setEditing(element.id);
      return;
    }
    // Dynamic content: spotlight the sidebar control that decides its value.
    select(element.id);
    requestPanelFocus();
  };

  return (
    <div
      className={[
        'pde-box',
        `pde-box--${element.kind}`,
        selected ? 'pde-box--selected' : '',
        editing ? 'pde-box--editing' : '',
        element.frame.anchor === 'bottom' ? 'pde-box--anchored' : ''
      ].join(' ')}
      style={{
        left: rect.x * zoom,
        top: rect.y * zoom,
        width: Math.max(rect.width * zoom, 2),
        height: Math.max(rect.height * zoom, isLine ? 2 : 2)
      }}
      onPointerDown={e => {
        if (editing) {
          e.stopPropagation();
          return;
        }
        onStartMove(e, element.id);
      }}
      onClick={e => e.stopPropagation()}
      onDoubleClick={onDoubleClick}
      title={element.kind === 'text' && !editing ? 'Doble clic para editar el texto' : undefined}
    >
      {editing && element.kind === 'text' ? (
        <InlineTextEditor element={element} />
      ) : element.kind === 'line' ? (
        <div
          className="pde-box__line"
          style={{
            background: element.color,
            height: element.direction === 'h' ? Math.max(1, element.thickness * zoom) : '100%',
            width: element.direction === 'v' ? Math.max(1, element.thickness * zoom) : '100%'
          }}
        />
      ) : element.kind === 'image' ? (
        <ImagePreview element={element} descriptor={descriptor} assets={assets} />
      ) : (
        <div
          className="pde-box__text"
          style={{
            fontSize: element.style.size * zoom,
            color: element.style.color,
            textAlign: element.style.align ?? 'left',
            lineHeight: element.style.lineHeight ?? 1.3,
            fontWeight: element.style.font.includes('bold') ? 600 : 400,
            fontStyle: element.style.font.includes('italic') ? 'italic' : 'normal'
          }}
        >
          {previewText(element, descriptor, locale)}
        </div>
      )}

      {selected &&
        !editing &&
        CORNERS.map(corner => (
          <div
            key={corner}
            className={`pde-handle pde-handle--${corner}`}
            onPointerDown={e => {
              e.stopPropagation();
              onStartResize(e, element.id, corner);
            }}
          />
        ))}
    </div>
  );
}
