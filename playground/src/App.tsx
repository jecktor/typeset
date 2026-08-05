import { useEffect, useState } from 'react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createTemplate, type Template } from '../../src/core';
import type { AssetResolver } from '../../src/render';
import { TemplateEditor } from '../../src/editor';
import { TemplatesModule, localStorageAdapter } from '../../src/module';
import '../../src/editor/styles.css';
import { demoTemplate } from './demo-template';
import { MODELS } from './models';

const PUBLIC_ASSETS: Record<string, string> = {
  letterhead: '/letterhead.pdf',
  signature: '/signature.png',
  'product-a': '/product-a.png',
  'product-b': '/product-b.png'
};

/** Uploads persist for the session only (playground). */
const uploads = new Map<string, Uint8Array>();

const assets: AssetResolver = {
  async resolve(assetId) {
    const uploaded = uploads.get(assetId);
    if (uploaded) return uploaded;
    const url = PUBLIC_ASSETS[assetId];
    if (!url) throw new Error(`Asset desconocido: ${assetId}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo cargar ${url}`);
    return new Uint8Array(await res.arrayBuffer());
  }
};

async function onAssetUpload(file: File): Promise<{ assetId: string }> {
  const assetId = `upload-${crypto.randomUUID()}`;
  uploads.set(assetId, new Uint8Array(await file.arrayBuffer()));
  return { assetId };
}

const storage = localStorageAdapter('pde-playground-templates');

/**
 * The two ways host apps actually integrate this package. Both are here so the
 * playground shows what production shows: landing-increscendo mounts the whole
 * module, while facturalandia and coffee-combat mount only the editor and keep
 * their own list (their lists carry domain the library has no business owning:
 * owner company, per-customer default templates, permissions).
 */
type Mode = 'module' | 'editor';

const BAR: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 14px',
  borderBottom: '1px solid #dcdfe3',
  background: '#fff',
  font: '13px system-ui, sans-serif',
  flexWrap: 'wrap'
};

function Toggle({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        font: 'inherit',
        padding: '4px 10px',
        borderRadius: 7,
        cursor: 'pointer',
        border: `1px solid ${active ? '#6db521' : '#dcdfe3'}`,
        background: active ? '#6db521' : '#fff',
        color: active ? '#fff' : '#212121'
      }}
    >
      {children}
    </button>
  );
}

export function App() {
  const [mode, setMode] = useState<Mode>('module');
  const [seeded, setSeeded] = useState(false);
  const [modelName, setModelName] = useState(MODELS[0]!.name);
  const [editorTemplate, setEditorTemplate] = useState<Template>(demoTemplate);
  const [dirty, setDirty] = useState(false);

  // Seed the validated cotización template on first run.
  useEffect(() => {
    storage.list().then(async items => {
      if (items.length === 0) await storage.save(demoTemplate);
      setSeeded(true);
    });
  }, []);

  /** A blank template is the only way to reach the editor's empty state. */
  const openBlank = () => {
    setEditorTemplate(
      createTemplate({
        id: `tpl-blank-${crypto.randomUUID()}`,
        name: 'Plantilla en blanco',
        docType: 'carta',
        model: modelName
      })
    );
    setDirty(false);
  };

  const openDemo = () => {
    setEditorTemplate(demoTemplate);
    setDirty(false);
  };

  if (!seeded) return null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={BAR}>
        <strong style={{ marginRight: 4 }}>Playground</strong>
        <span style={{ color: '#6b7280' }}>Integración:</span>
        <Toggle active={mode === 'module'} onClick={() => setMode('module')}>
          Módulo completo
        </Toggle>
        <Toggle active={mode === 'editor'} onClick={() => setMode('editor')}>
          Solo editor
        </Toggle>

        {mode === 'editor' && (
          <>
            <span style={{ marginLeft: 12, color: '#6b7280' }}>Plantilla:</span>
            <Toggle active={editorTemplate.id === demoTemplate.id} onClick={openDemo}>
              Demo
            </Toggle>
            <Toggle
              active={editorTemplate.id !== demoTemplate.id}
              onClick={openBlank}
            >
              En blanco
            </Toggle>
            <span style={{ marginLeft: 12, color: '#6b7280' }}>Modelo:</span>
            <select
              value={modelName}
              onChange={e => setModelName(e.target.value)}
              style={{ font: 'inherit', padding: '4px 6px', borderRadius: 7 }}
            >
              {MODELS.map(m => (
                <option key={m.name} value={m.name}>
                  {m.label}
                </option>
              ))}
            </select>
            <span style={{ marginLeft: 'auto', color: dirty ? '#b45309' : '#6b7280' }}>
              {dirty ? 'con cambios sin guardar' : 'sin cambios'}
            </span>
          </>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {mode === 'module' ? (
          <TemplatesModule
            storage={storage}
            models={MODELS}
            assets={assets}
            onAssetUpload={onAssetUpload}
            workerSrc={workerUrl}
          />
        ) : (
          <TemplateEditor
            key={editorTemplate.id}
            value={editorTemplate}
            onChange={t => {
              setEditorTemplate(t);
              setDirty(true);
            }}
            models={MODELS}
            assets={assets}
            onAssetUpload={onAssetUpload}
            workerSrc={workerUrl}
          />
        )}
      </div>
    </div>
  );
}
