import {
  useCallback,
  useEffect,
  useRef,
  type DragEvent,
  type MouseEvent,
  type PointerEvent
} from 'react';
import { Document, Page } from 'react-pdf';
import type { ModelDescriptor } from '../core';
import type { AssetsInput } from '../render';
import { ElementBox } from './ElementBox';
import { FlowGhost } from './FlowGhost';
import { createElementAt } from './flowDefaults';
import { scopesForTab, useEditor, type PlacingSpec } from './store';
import type { ResizeCorner } from './geometry';
import { useAssetUrl } from './useAssetUrl';

interface Props {
  assets?: AssetsInput;
  descriptor?: ModelDescriptor;
}

export const DND_MIME = 'application/x-pde-element';

export function Canvas({ assets, descriptor }: Props) {
  const template = useEditor(s => s.template);
  const zoom = useEditor(s => s.zoom);
  const tab = useEditor(s => s.scopeTab);
  const placing = useEditor(s => s.placing);
  const interaction = useEditor(s => s.interaction);
  const guides = useEditor(s => s.guides);
  const addElement = useEditor(s => s.addElement);
  const deselect = useEditor(s => s.deselect);
  const startInteraction = useEditor(s => s.startInteraction);
  const startRegionInteraction = useEditor(s => s.startRegionInteraction);
  const updateInteraction = useEditor(s => s.updateInteraction);
  const endInteraction = useEditor(s => s.endInteraction);
  const setPlacing = useEditor(s => s.setPlacing);

  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoomMode = useEditor(s => s.zoomMode);
  const setFitZoom = useEditor(s => s.setFitZoom);

  const bg = template.background ?? {};
  const bgRef =
    tab === 'first'
      ? bg.first
      : tab === 'middle'
        ? (bg.middle ?? bg.first)
        : (bg.last ?? bg.middle ?? bg.first);
  const bgUrl = useAssetUrl(assets, bgRef?.assetId);

  const { width: pageW, height: pageH } = template.pageSize;

  // Fit-to-view: scale the page to the available canvas area and track
  // container resizes until the user zooms manually.
  useEffect(() => {
    if (zoomMode !== 'fit') return;
    const el = canvasRef.current;
    if (!el) return;
    const PADDING = 48;
    const fit = () => {
      const rect = el.getBoundingClientRect();
      const z = Math.min(
        (rect.width - PADDING) / pageW,
        (rect.height - PADDING) / pageH
      );
      if (z > 0) setFitZoom(z);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [zoomMode, pageW, pageH, setFitZoom]);

  /** Pointer position in page points (zoom-corrected). */
  const pointCoords = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const rect = pageRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return {
        x: (e.clientX - rect.left) / zoom,
        y: (e.clientY - rect.top) / zoom
      };
    },
    [zoom]
  );

  const placeAt = useCallback(
    (spec: PlacingSpec, x: number, y: number) => {
      const element = createElementAt(spec, x, y, tab, template);
      if (element) {
        addElement(element);
        setPlacing(null);
      }
    },
    [tab, template, addElement, setPlacing]
  );

  const onStartMove = useCallback(
    (e: PointerEvent, id: string) => {
      e.stopPropagation();
      const coords = pointCoords(e);
      if (!coords) return;
      startInteraction('move', id, coords.x, coords.y);
    },
    [pointCoords, startInteraction]
  );

  const onStartResize = useCallback(
    (e: PointerEvent, id: string, corner: ResizeCorner) => {
      const coords = pointCoords(e);
      if (!coords) return;
      startInteraction('resize', id, coords.x, coords.y, corner);
    },
    [pointCoords, startInteraction]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!interaction) return;
      const coords = pointCoords(e);
      if (coords) updateInteraction(coords.x, coords.y);
    },
    [interaction, pointCoords, updateInteraction]
  );

  const onCanvasClick = useCallback(
    (e: MouseEvent) => {
      if (!placing) {
        deselect();
        return;
      }
      const coords = pointCoords(e);
      if (coords) placeAt(placing, coords.x, coords.y);
    },
    [placing, pointCoords, placeAt, deselect]
  );

  // Clicking the gray area around the page also clears the selection. Guarded
  // by target === currentTarget so bubbled page clicks (which may have just
  // placed + selected an element) aren't undone.
  const onOutsideClick = useCallback(
    (e: MouseEvent) => {
      if (e.target === e.currentTarget) deselect();
    },
    [deselect]
  );

  const onDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes(DND_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      const raw = e.dataTransfer.getData(DND_MIME);
      if (!raw) return;
      e.preventDefault();
      const coords = pointCoords(e);
      if (!coords) return;
      try {
        placeAt(JSON.parse(raw) as PlacingSpec, coords.x, coords.y);
      } catch {
        // malformed payload — ignore
      }
    },
    [pointCoords, placeAt]
  );

  const onRegionPointerDown = useCallback(
    (e: PointerEvent, kind: 'move' | 'resize') => {
      if (tab === 'last') return;
      e.stopPropagation();
      const coords = pointCoords(e);
      if (!coords) return;
      startRegionInteraction(kind, tab, coords.x, coords.y);
    },
    [tab, pointCoords, startRegionInteraction]
  );

  const showMargins = useEditor(s => s.showMargins);
  const margins = template.margins;

  const visibleScopes = scopesForTab(tab);
  const elements = template.elements.filter(el => visibleScopes.includes(el.scope));
  const flowRegion =
    template.flow && (tab === 'first' || tab === 'middle')
      ? template.flow.regions[tab]
      : null;
  const isBlank =
    elements.length === 0 && (!template.flow || template.flow.stack.length === 0);

  return (
    <div className="pde-canvas" ref={canvasRef} onClick={onOutsideClick}>
      <div
        ref={pageRef}
        className={`pde-page ${placing ? 'pde-page--placing' : ''}`}
        style={{ width: pageW * zoom, height: pageH * zoom }}
        onPointerMove={onPointerMove}
        onPointerUp={endInteraction}
        onPointerLeave={endInteraction}
        onClick={onCanvasClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {bgUrl && bgRef && (
          <div className="pde-page__bg">
            <Document file={bgUrl} loading={null} error={null}>
              <Page
                pageNumber={bgRef.pageIndex + 1}
                width={pageW * zoom}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>
          </div>
        )}

        {margins && showMargins && (
          <div
            className="pde-margins"
            style={{
              left: margins.left * zoom,
              top: margins.top * zoom,
              width: Math.max(0, pageW - margins.left - margins.right) * zoom,
              height: Math.max(0, pageH - margins.top - margins.bottom) * zoom
            }}
          />
        )}

        {flowRegion && (
          <div
            className="pde-flow-region"
            style={{
              left: flowRegion.x * zoom,
              top: flowRegion.yTop * zoom,
              width: flowRegion.width * zoom,
              height: (flowRegion.yBottom - flowRegion.yTop) * zoom
            }}
          >
            <span
              className="pde-flow-region__label"
              title="Arrastra para mover el área de contenido"
              onPointerDown={e => onRegionPointerDown(e, 'move')}
            >
              ⠿ contenido — {tab === 'first' ? 'primera página' : 'páginas intermedias'}
            </span>
            <FlowGhost descriptor={descriptor} assets={assets} />
            <div
              className="pde-handle pde-handle--se pde-flow-region__resize"
              title="Arrastra para cambiar el tamaño"
              onPointerDown={e => onRegionPointerDown(e, 'resize')}
            />
          </div>
        )}

        {elements.map(el => (
          <ElementBox
            key={el.id}
            element={el}
            descriptor={descriptor}
            assets={assets}
            onStartMove={onStartMove}
            onStartResize={onStartResize}
          />
        ))}

        {isBlank && !placing && (
          <div className="pde-empty-hint">
            <strong>La página está vacía</strong>
            <span>
              Arrastra un campo o un elemento desde el panel izquierdo hasta
              aquí para empezar.
            </span>
          </div>
        )}

        {guides?.x.map(x => (
          <div key={`gx${x}`} className="pde-guide pde-guide--v" style={{ left: x * zoom }} />
        ))}
        {guides?.y.map(y => (
          <div key={`gy${y}`} className="pde-guide pde-guide--h" style={{ top: y * zoom }} />
        ))}
      </div>
    </div>
  );
}
