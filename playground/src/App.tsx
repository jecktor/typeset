import { useEffect, useMemo, useState } from 'react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ModelDescriptor } from '../../src/core';
import type { AssetResolver } from '../../src/render';
import { TemplatesModule, localStorageAdapter } from '../../src/module';
import '../../src/editor/styles.css';
import { demoTemplate, demoSample } from './demo-template';

const PUBLIC_ASSETS: Record<string, string> = {
  letterhead: '/letterhead.pdf',
  signature: '/signature.png'
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

const cotizacionModel: ModelDescriptor = {
  name: 'cotizacion',
  label: 'Cotización',
  fields: [
    { kind: 'scalar', key: 'cotizacionNumber', label: 'Número', type: 'string' },
    { kind: 'scalar', key: 'date', label: 'Fecha', type: 'date', format: 'full' },
    { kind: 'scalar', key: 'customerName', label: 'Cliente', type: 'string' },
    { kind: 'scalar', key: 'notas', label: 'Notas', type: 'string' },
    { kind: 'scalar', key: 'totals.subtotal', label: 'Subtotal', type: 'currency' },
    { kind: 'scalar', key: 'totals.tax', label: 'Impuesto', type: 'currency' },
    { kind: 'scalar', key: 'totals.total', label: 'Total', type: 'currency' },
    {
      kind: 'list',
      key: 'items',
      label: 'Partidas',
      itemFields: [
        { key: 'cantidad', label: 'Cantidad', type: 'number' },
        { key: 'description', label: 'Descripción', type: 'string' },
        { key: 'subtotal', label: 'Subtotal', type: 'currency' },
        { key: 'tax', label: 'Impuesto', type: 'currency' },
        { key: 'total', label: 'Total', type: 'currency' }
      ]
    }
  ],
  sample: demoSample() as unknown as Record<string, unknown>
};

const storage = localStorageAdapter('pde-playground-templates');

export function App() {
  const models = useMemo(() => [cotizacionModel], []);
  const [seeded, setSeeded] = useState(false);

  // Seed the validated cotización template on first run.
  useEffect(() => {
    storage.list().then(async items => {
      if (items.length === 0) await storage.save(demoTemplate);
      setSeeded(true);
    });
  }, []);

  if (!seeded) return null;

  return (
    <div style={{ height: '100%' }}>
      <TemplatesModule
        storage={storage}
        models={models}
        assets={assets}
        onAssetUpload={onAssetUpload}
        workerSrc={workerUrl}
      />
    </div>
  );
}
