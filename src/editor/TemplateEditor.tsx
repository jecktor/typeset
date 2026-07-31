import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from 'react';

import {
  validateTemplate,
  type FormatterRegistry,
  type ModelDescriptor,
  type Template
} from '../core';
import type { AssetsInput } from '../render';
import { Canvas } from './Canvas';
import { FlowItemPanel } from './FlowItemPanel';
import { Palette } from './Palette';
import { PreviewPane } from './PreviewPane';
import { PropertiesPanel } from './PropertiesPanel';
import { markTourDone, shouldAutoStartTour, Tour } from './Tour';
import { themeStyle, type EditorTheme } from './theme';
import {
  createEditorStore,
  EditorContext,
  useEditor,
  type ScopeTab
} from './store';
import { setupPdfWorker } from './worker';

export interface TemplateEditorProps {
  /** Controlled template value. */
  value: Template;
  /** Debounced (500 ms) with every edit — the host owns persistence. */
  onChange?: (template: Template) => void;
  /** Models available for binding; matched against template.model. */
  models?: ModelDescriptor[];
  /** Resolves assetIds (backgrounds, logos) for display AND preview. */
  assets?: AssetsInput;
  /** Host uploads the file and returns its assetId. Enables image upload. */
  onAssetUpload?: (file: File) => Promise<{ assetId: string }>;
  /** pdfjs worker URL; see setupPdfWorker. */
  workerSrc?: string;
  formatters?: FormatterRegistry;
  /** First-run guided tour (persisted in localStorage). Default true. */
  tour?: boolean;
  /** Brand colors; equivalent to setting --pde-* variables on an ancestor. */
  theme?: EditorTheme;
  className?: string;
}

const TABS: Array<{ value: ScopeTab; label: string }> = [
  { value: 'first', label: 'Primera' },
  { value: 'middle', label: 'Intermedias' },
  { value: 'last', label: 'Última' }
];

const ZOOM_STEPS = 0.25;

function EditorShell({
  models,
  assets,
  onAssetUpload,
  formatters,
  tour = true,
  theme,
  className
}: Pick<
  TemplateEditorProps,
  'models' | 'assets' | 'onAssetUpload' | 'formatters' | 'tour' | 'theme' | 'className'
>) {
  const template = useEditor(s => s.template);
  const mode = useEditor(s => s.mode);
  const setMode = useEditor(s => s.setMode);
  const tab = useEditor(s => s.scopeTab);
  const setScopeTab = useEditor(s => s.setScopeTab);
  const zoom = useEditor(s => s.zoom);
  const setZoom = useEditor(s => s.setZoom);
  const zoomMode = useEditor(s => s.zoomMode);
  const setZoomMode = useEditor(s => s.setZoomMode);
  const selectedId = useEditor(s => s.selectedId);
  const selectedFlowId = useEditor(s => s.selectedFlowId);
  const removeElement = useEditor(s => s.removeElement);
  const placing = useEditor(s => s.placing);
  const setPlacing = useEditor(s => s.setPlacing);
  const canUndo = useEditor(s => s.history.length > 0);
  const canRedo = useEditor(s => s.future.length > 0);
  const undo = useEditor(s => s.undo);
  const redo = useEditor(s => s.redo);
  const [showIssues, setShowIssues] = useState(false);
  const [tourOpen, setTourOpen] = useState(() => tour && shouldAutoStartTour());
  const editCount = useEditor(s => s.history.length);
  const previewSeen = useEditor(s => s.previewSeen);
  const nudgePreview = mode === 'edit' && !previewSeen && editCount >= 5;

  const closeTour = () => {
    setTourOpen(false);
    markTourDone();
  };

  // Fallback for undo/redo when focus escaped to <body> (e.g. after clicking
  // a button that unmounted itself) — the root onKeyDown can't see those.
  useEffect(() => {
    const onDocKey = (e: globalThis.KeyboardEvent) => {
      if (e.target !== document.body) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    document.addEventListener('keydown', onDocKey);
    return () => document.removeEventListener('keydown', onDocKey);
  }, [undo, redo]);

  // No model on the template → no data palette. Falling back to the first
  // descriptor would offer fields that can never resolve at render time.
  const descriptor = useMemo(
    () =>
      template.model
        ? models?.find(m => m.name === template.model)
        : undefined,
    [models, template.model]
  );

  const issues = useMemo(
    () => validateTemplate(template, descriptor),
    [template, descriptor]
  );

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const inField =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT';
    if (e.key === 'Escape' && placing) setPlacing(null);
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !inField) {
      e.preventDefault();
      removeElement(selectedId);
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !inField) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
  };

  return (
    <div
      className={`pde-root ${className ?? ''}`}
      style={themeStyle(theme)}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <header className="pde-toolbar">
        <strong className="pde-toolbar__name">{template.name}</strong>

        {mode === 'edit' && (
          <div className="pde-tabs" role="tablist">
            {TABS.map(t => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                className={`pde-tab ${tab === t.value ? 'pde-tab--active' : ''}`}
                onClick={() => setScopeTab(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {mode === 'edit' && (
          <div className="pde-zoom">
            <button
              type="button"
              className="pde-btn"
              title="Deshacer (Ctrl+Z)"
              disabled={!canUndo}
              onClick={undo}
            >
              ↶
            </button>
            <button
              type="button"
              className="pde-btn"
              title="Rehacer (Ctrl+Shift+Z)"
              disabled={!canRedo}
              onClick={redo}
            >
              ↷
            </button>
          </div>
        )}

        <div className="pde-toolbar__spacer" />

        {issues.length > 0 && (
          <button
            type="button"
            className={`pde-btn pde-issues-toggle ${
              issues.some(i => i.severity === 'error') ? 'pde-issues-toggle--error' : ''
            }`}
            onClick={() => setShowIssues(v => !v)}
          >
            ⚠ {issues.length}
          </button>
        )}

        <div className="pde-zoom">
          <button type="button" className="pde-btn" onClick={() => setZoom(zoom - ZOOM_STEPS)}>
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" className="pde-btn" onClick={() => setZoom(zoom + ZOOM_STEPS)}>
            +
          </button>
          <button
            type="button"
            className={`pde-btn ${zoomMode === 'fit' ? 'pde-btn--active' : ''}`}
            title="Ajustar la página al área visible"
            onClick={() => setZoomMode('fit')}
          >
            Ajustar
          </button>
        </div>

        <button
          type="button"
          className={`pde-btn pde-btn--primary pde-btn--preview ${nudgePreview ? 'pde-btn--nudge' : ''}`}
          title={nudgePreview ? 'Mira cómo va quedando tu documento' : undefined}
          onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}
        >
          {mode === 'edit' ? 'Vista previa' : 'Editar'}
        </button>

        <button
          type="button"
          className="pde-btn"
          title="Ver el tutorial"
          onClick={() => setTourOpen(true)}
        >
          ?
        </button>
      </header>

      {tourOpen && mode === 'edit' && <Tour onClose={closeTour} />}

      {showIssues && issues.length > 0 && (
        <ul className="pde-issues">
          {issues.map((issue, i) => (
            <li key={i} className={`pde-issues__item pde-issues__item--${issue.severity}`}>
              {issue.severity === 'error' ? '✗' : '⚠'} {issue.message}
            </li>
          ))}
        </ul>
      )}

      <div className="pde-body">
        {mode === 'edit' ? (
          <>
            <Palette descriptor={descriptor} />
            <Canvas assets={assets} descriptor={descriptor} />
            {selectedFlowId ? (
              <FlowItemPanel descriptor={descriptor} onAssetUpload={onAssetUpload} />
            ) : (
              <PropertiesPanel descriptor={descriptor} onAssetUpload={onAssetUpload} />
            )}
          </>
        ) : (
          <PreviewPane assets={assets} descriptor={descriptor} formatters={formatters} />
        )}
      </div>
    </div>
  );
}

export function TemplateEditor(props: TemplateEditorProps) {
  const { value, onChange, workerSrc, className } = props;

  const storeRef = useRef<ReturnType<typeof createEditorStore> | null>(null);
  storeRef.current ??= createEditorStore(value);
  const store = storeRef.current;

  useEffect(() => setupPdfWorker(workerSrc), [workerSrc]);

  // Controlled sync: external value replaces internal state unless it's the
  // one we just emitted.
  const lastEmitted = useRef<Template>(value);
  useEffect(() => {
    if (value !== lastEmitted.current && value !== store.getState().template) {
      store.getState().setTemplate(value);
      lastEmitted.current = value;
    }
  }, [value, store]);

  // Debounced onChange, mirroring documentDesigner's contract.
  useEffect(() => {
    if (!onChange) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = store.subscribe((state, prev) => {
      if (state.template === prev.template) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        lastEmitted.current = state.template;
        onChange(state.template);
      }, 500);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [onChange, store]);

  return (
    <EditorContext.Provider value={store}>
      <EditorShell
        models={props.models}
        assets={props.assets}
        onAssetUpload={props.onAssetUpload}
        formatters={props.formatters}
        tour={props.tour}
        theme={props.theme}
        className={className}
      />
    </EditorContext.Provider>
  );
}
