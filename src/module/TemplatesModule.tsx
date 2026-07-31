import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createTemplate,
  validateTemplate,
  type DocType,
  type FormatterRegistry,
  type ModelDescriptor,
  type Template
} from '../core';
import type { AssetsInput } from '../render';
import { TemplateEditor, themeStyle, type EditorTheme } from '../editor';
import { DEFAULT_STRINGS, type ModuleStrings } from './strings';
import type { TemplateStorageAdapter, TemplateSummary } from './storage';

export interface TemplatesModuleProps {
  storage: TemplateStorageAdapter;
  models?: ModelDescriptor[];
  assets?: AssetsInput;
  /** Required for background PDFs and image uploads. */
  onAssetUpload?: (file: File) => Promise<{ assetId: string }>;
  workerSrc?: string;
  formatters?: FormatterRegistry;
  strings?: Partial<ModuleStrings>;
  /** First-run guided tour in the editor (persisted). Default true. */
  tour?: boolean;
  /** Brand colors applied to the whole module (list, wizard and editor). */
  theme?: EditorTheme;
  className?: string;
}

type View =
  | { name: 'list' }
  | { name: 'wizard' }
  | { name: 'editor'; template: Template; dirty: boolean; justSaved: boolean };

function newTemplateId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `tpl-${uuid ?? Math.random().toString(36).slice(2, 10)}`;
}

function Wizard({
  s,
  models,
  onAssetUpload,
  onCancel,
  onCreate
}: {
  s: ModuleStrings;
  models?: ModelDescriptor[];
  onAssetUpload?: TemplatesModuleProps['onAssetUpload'];
  onCancel(): void;
  onCreate(template: Template): void;
}) {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<DocType>('carta');
  const [customW, setCustomW] = useState(612);
  const [customH, setCustomH] = useState(792);
  const [model, setModel] = useState(models?.[0]?.name ?? '');
  const [backgroundId, setBackgroundId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const create = () => {
    if (!name.trim()) {
      setNameError(true);
      nameRef.current?.focus();
      return;
    }
    const template = createTemplate({
      id: newTemplateId(),
      name: name.trim(),
      docType,
      pageSize: docType === 'custom' ? { width: customW, height: customH } : undefined,
      model: model || undefined
    });
    if (backgroundId) {
      template.background = { first: { assetId: backgroundId, pageIndex: 0 } };
    }
    onCreate(template);
  };

  return (
    <div className="pde-module__wizard">
      <h2>{s.wizardTitle}</h2>

      <label className={`pde-field ${nameError ? 'pde-field--invalid' : ''}`}>
        <span>{s.name}</span>
        <input
          ref={nameRef}
          autoFocus
          value={name}
          placeholder={s.namePlaceholder}
          aria-invalid={nameError || undefined}
          onChange={e => {
            setName(e.target.value);
            if (e.target.value.trim()) setNameError(false);
          }}
        />
        {nameError && <small className="pde-field__error">{s.nameRequired}</small>}
      </label>

      <label className="pde-field">
        <span>{s.type}</span>
        <select value={docType} onChange={e => setDocType(e.target.value as DocType)}>
          <option value="carta">{s.carta}</option>
          <option value="oficio">{s.oficio}</option>
          <option value="custom">{s.custom}</option>
        </select>
      </label>

      {docType === 'custom' && (
        <div className="pde-props__grid">
          <label className="pde-field">
            <span>{s.widthPt}</span>
            <input
              type="number"
              value={customW}
              onChange={e => setCustomW(Number(e.target.value) || 612)}
            />
          </label>
          <label className="pde-field">
            <span>{s.heightPt}</span>
            <input
              type="number"
              value={customH}
              onChange={e => setCustomH(Number(e.target.value) || 792)}
            />
          </label>
        </div>
      )}

      {models && models.length > 0 && (
        <label className="pde-field">
          <span>{s.model}</span>
          <select value={model} onChange={e => setModel(e.target.value)}>
            <option value="">{s.noModel}</option>
            {models.map(m => (
              <option key={m.name} value={m.name}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {onAssetUpload && (
        <label className="pde-field">
          <span>{s.background}</span>
          <input
            type="file"
            accept="application/pdf"
            disabled={uploading}
            onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                const { assetId } = await onAssetUpload(file);
                setBackgroundId(assetId);
              } finally {
                setUploading(false);
              }
            }}
          />
          <small>{s.backgroundHint}</small>
        </label>
      )}

      <div className="pde-module__wizard-actions">
        <button type="button" className="pde-btn" onClick={onCancel}>
          {s.cancel}
        </button>
        <button
          type="button"
          className="pde-btn pde-btn--primary"
          disabled={uploading}
          onClick={create}
        >
          {s.create}
        </button>
      </div>
    </div>
  );
}

export function TemplatesModule(props: TemplatesModuleProps) {
  const { storage, models, className } = props;
  const s = useMemo(
    () => ({ ...DEFAULT_STRINGS, ...props.strings }),
    [props.strings]
  );

  const [view, setView] = useState<View>({ name: 'list' });
  const [items, setItems] = useState<TemplateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setItems(null);
    storage
      .list()
      .then(setItems)
      .catch(err => setError(String(err)));
  }, [storage]);

  useEffect(() => {
    if (view.name === 'list') refresh();
  }, [view.name, refresh]);

  // Unsaved changes must survive accidental tab close/refresh. (SPA
  // navigation inside the host app is the host's responsibility — App Router
  // offers no blocking API — but the in-module exits are guarded below.)
  const dirty = view.name === 'editor' && view.dirty;
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const backToList = () => {
    if (dirty && !confirm(s.confirmDiscard)) return;
    setView({ name: 'list' });
  };

  const openTemplate = async (id: string) => {
    try {
      const template = await storage.get(id);
      setView({ name: 'editor', template, dirty: false, justSaved: false });
    } catch (err) {
      setError(String(err));
    }
  };

  const duplicate = async (id: string) => {
    try {
      const original = await storage.get(id);
      await storage.save({
        ...original,
        id: newTemplateId(),
        name: `${original.name} ${s.copySuffix}`.trim()
      });
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const save = async () => {
    if (view.name !== 'editor') return;
    const descriptor = models?.find(m => m.name === view.template.model);
    const errors = validateTemplate(view.template, descriptor).filter(
      i => i.severity === 'error'
    );
    if (errors.length > 0) {
      setError(`${s.fixErrors}: ${errors[0]!.message}`);
      return;
    }
    setError(null);
    await storage.save(view.template);
    setView({ ...view, dirty: false, justSaved: true });
  };

  if (view.name === 'editor') {
    return (
      <div className={`pde-module ${className ?? ''}`} style={themeStyle(props.theme)}>
        <div className="pde-module__editor-bar">
          <button type="button" className="pde-btn" onClick={backToList}>
            {s.back}
          </button>
          <strong>{view.template.name}</strong>
          {error && <span className="pde-module__error">{error}</span>}
          <div className="pde-toolbar__spacer" />
          <button
            type="button"
            className="pde-btn pde-btn--primary"
            disabled={!view.dirty}
            onClick={save}
          >
            {view.dirty ? s.save : view.justSaved ? s.saved : s.save}
          </button>
        </div>
        <div className="pde-module__editor-body">
          <TemplateEditor
            value={view.template}
            onChange={template =>
              setView(v =>
                v.name === 'editor'
                  ? { ...v, template, dirty: true, justSaved: false }
                  : v
              )
            }
            models={models}
            assets={props.assets}
            onAssetUpload={props.onAssetUpload}
            workerSrc={props.workerSrc}
            formatters={props.formatters}
            tour={props.tour}
          />
        </div>
      </div>
    );
  }

  if (view.name === 'wizard') {
    return (
      <div className={`pde-module ${className ?? ''}`} style={themeStyle(props.theme)}>
        <Wizard
          s={s}
          models={models}
          onAssetUpload={props.onAssetUpload}
          onCancel={() => setView({ name: 'list' })}
          onCreate={template =>
            setView({ name: 'editor', template, dirty: true, justSaved: false })
          }
        />
      </div>
    );
  }

  return (
    <div className={`pde-module ${className ?? ''}`} style={themeStyle(props.theme)}>
      <div className="pde-module__header">
        <h2>{s.templates}</h2>
        <button
          type="button"
          className="pde-btn pde-btn--primary"
          onClick={() => setView({ name: 'wizard' })}
        >
          {s.newTemplate}
        </button>
      </div>

      {error && <div className="pde-module__error">{error}</div>}

      {items === null ? (
        <p className="pde-props__empty">{s.loading}</p>
      ) : items.length === 0 ? (
        <p className="pde-props__empty">{s.empty}</p>
      ) : (
        <table className="pde-table">
          <thead>
            <tr>
              <th>{s.name}</th>
              <th>{s.type}</th>
              <th>{s.model}</th>
              <th>{s.updated}</th>
              <th>{s.actions}</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>
                  <button
                    type="button"
                    className="pde-link"
                    onClick={() => openTemplate(item.id)}
                  >
                    {item.name}
                  </button>
                </td>
                <td>{item.docType}</td>
                <td>{models?.find(m => m.name === item.model)?.label ?? item.model ?? '—'}</td>
                <td>
                  {item.updatedAt
                    ? new Date(item.updatedAt).toLocaleString()
                    : '—'}
                </td>
                <td>
                  <button
                    type="button"
                    className="pde-btn"
                    onClick={() => openTemplate(item.id)}
                  >
                    {s.edit}
                  </button>{' '}
                  <button
                    type="button"
                    className="pde-btn"
                    onClick={() => duplicate(item.id)}
                  >
                    {s.duplicate}
                  </button>{' '}
                  <button
                    type="button"
                    className="pde-btn pde-btn--danger"
                    onClick={async () => {
                      if (confirm(s.confirmDelete)) {
                        await storage.remove(item.id);
                        refresh();
                      }
                    }}
                  >
                    {s.delete}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
