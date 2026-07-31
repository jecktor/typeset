# Integrating @pibytelabs/typeset

Developer guide for wiring the package into an app. End users never read
this: the editor teaches itself (first-run tour, contextual hints); this
document is for the person writing the glue code.

## Install

The package lives on the private Verdaccio registry. Make sure the project's
`.npmrc` routes the scope (all existing `@pibytelabs` consumers already do):

```ini
@pibytelabs:registry=https://registry.alagrandelepusecuca.mx/
//registry.alagrandelepusecuca.mx/:_authToken=${NPM_TOKEN}
```

```sh
npm install @pibytelabs/typeset
```

Peer dependencies: `pdf-lib >= 1.17` and `zod >= 3` always; `react >= 19`,
`react-dom >= 19`, `react-pdf >= 10`, `pdfjs-dist >= 5 < 6` only if you use
the editor UI; `@pdf-lib/fontkit` only for custom font assets.

## Entry points

| Import | What | Where |
|---|---|---|
| `@pibytelabs/typeset/core` | types, `parseTemplate`, `createTemplate`, `validateTemplate`, `ModelDescriptor` | anywhere |
| `@pibytelabs/typeset/render` | `renderPdf`, `planLayout`, `urlAssetResolver` | Node ≥ 18 + browser |
| `@pibytelabs/typeset/editor` | `<TemplateEditor/>`, `setupPdfWorker` | browser |
| `@pibytelabs/typeset/module` | `<TemplatesModule/>`, `TemplateStorageAdapter`, `localStorageAdapter` | browser |
| `@pibytelabs/typeset/editor/styles.css` | compiled styles (pde- prefixed) | import once |

## Generating PDFs (server side)

Templates are plain JSON. Parse, then render with data and assets:

```ts
import fs from 'node:fs/promises';
import { parseTemplate } from '@pibytelabs/typeset/core';
import { renderPdf } from '@pibytelabs/typeset/render';
import templateJson from './templates/cotizacion.template.json';

const template = parseTemplate(templateJson); // validates + migrates

export async function buildPdf(record: MyRecord): Promise<Uint8Array> {
  return renderPdf({
    template,
    data: record as unknown as Record<string, unknown>,
    assets: {
      async resolve(assetId) {
        // backgrounds, logos, fonts (however your app stores them)
        return new Uint8Array(await fs.readFile(pathFor(assetId)));
      }
    },
    onWarning: w => console.warn('[pdf]', w)
  });
}
```

`renderPdf` does zero I/O of its own: everything arrives as bytes through the
resolver, so the same call works in a Next route handler and in the browser.
Real-world reference: the consuming app keeps a thin builder module that binds its records and assets to a stored template.

## Describing your models (`ModelDescriptor`)

The descriptor is what turns the editor's palette into your app's vocabulary:

```ts
import type { ModelDescriptor } from '@pibytelabs/typeset/core';

const factura: ModelDescriptor = {
  name: 'factura',            // stored in template.model
  label: 'Factura',
  fields: [
    { kind: 'scalar', key: 'folio', label: 'Folio', type: 'string' },
    { kind: 'scalar', key: 'fecha', label: 'Fecha', type: 'date', format: 'long' },
    { kind: 'scalar', key: 'cliente.nombre', label: 'Cliente', type: 'string' },
    { kind: 'scalar', key: 'totales.total', label: 'Total', type: 'currency' },
    {
      kind: 'list',
      key: 'conceptos',
      label: 'Conceptos',
      itemFields: [
        { key: 'descripcion', label: 'Descripción', type: 'string' },
        { key: 'importe', label: 'Importe', type: 'currency' }
      ]
    }
  ],
  sample: {
    folio: 'F-0001',
    fecha: new Date(),
    cliente: { nombre: 'ACME SA de CV' },
    totales: { total: 11600 },
    conceptos: [
      { descripcion: 'Servicio corto', importe: 100 },
      { descripcion: 'Un concepto con descripción larga para ver saltos de línea', importe: 11500 }
    ]
  }
};
```

Rules of thumb:

- `key` is a dot path into the data object you pass at render time. Same
  contract in the editor and in `renderPdf` with no mapping layer.
- **`sample` is required and load-bearing**: it powers the canvas preview,
  the content-area ghost, and preview mode. Include one short and one long
  list item so authors see real wrapping.
- `type` drives formatting (`currency` → `Intl` MXN by default, `date` →
  `Intl.DateTimeFormat`). Custom formatting: pass `formatters` and use
  `format: 'custom:<name>'`.

## The Templates module (drop-in UI)

```tsx
import { TemplatesModule, type TemplateStorageAdapter } from '@pibytelabs/typeset/module';
import '@pibytelabs/typeset/editor/styles.css';

const storage: TemplateStorageAdapter = {
  list: () => api.get('/templates'),
  get: id => api.get(`/templates/${id}`).then(parseTemplate),
  save: t => api.put(`/templates/${t.id}`, t),
  remove: id => api.delete(`/templates/${id}`)
};

<TemplatesModule
  storage={storage}
  models={[factura]}
  assets={{ resolve: id => fetchAssetBytes(id) }}
  onAssetUpload={async file => ({ assetId: await uploadToB2(file) })}
  workerSrc={workerUrl}
/>;
```

- The module never talks to a backend directly; persistence is entirely the
  adapter's job. `localStorageAdapter()` ships for demos/playgrounds.
- `onAssetUpload` receives background PDFs and images; return the id your
  `assets` resolver will later understand. The package never stores files.
- Saving is blocked while `validateTemplate` reports errors (warnings pass).
- `strings` overrides any UI text of the module; `tour={false}` disables the
  editor's first-run tutorial.

Need only the canvas? Use `<TemplateEditor value onChange models assets/>`
directly. It is a controlled component (`onChange` debounced 500 ms).

## pdfjs worker (read this once)

`pdfjs-dist` must resolve to ONE copy, and the worker must match its version;
mismatched copies produce "API version does not match the Worker version". That's
why it's a peer dependency. Pass the worker explicitly:

```ts
// Vite
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
// Next (app router, client component)
const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

<TemplatesModule workerSrc={workerUrl} ... />
```

## Theming

Two equivalent ways to brand the UI per app; anything you don't set keeps its
default, and the soft accent tint follows your accent automatically.

**The `theme` prop** (recommended):

```tsx
<TemplatesModule
  theme={{ accent: '#0f766e', surface: '#f8fafc' }}
  ...
/>
```

**CSS custom properties** on any ancestor (useful when the brand lives in a
global stylesheet):

```css
.my-app {
  --pde-accent: #0f766e;
  --pde-surface: #f8fafc;
}
```

Available keys/variables: `accent`, `accentSoft`, `surface`, `panel`,
`border`, `text`, `muted`, `danger` (`--pde-accent`, `--pde-accent-soft`, …).

## Template JSON lifecycle

- Templates carry `schemaVersion`; always load through `parseTemplate` (it
  validates and migrates old versions, and refuses versions newer than the
  installed library).
- `validateTemplate(template, descriptor)` returns errors/warnings; call it
  server-side before persisting if clients can't be trusted.
- Coordinates are PDF points, top-left origin. Page size comes from the
  wizard's document type (carta 612×792, oficio 612×936, or custom).
