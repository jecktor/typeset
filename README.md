# @pibytelabs/typeset

Visual PDF template designer + headless renderer. Design document templates
(cotizaciones, facturas, planeaciones, reportes…) visually, save them as JSON,
and render them with real data from any app — Next route handlers or the
browser.

## Status

**Phase 1 (core + headless renderer): done and validated** — the engine
reproduces a production app's hand-rolled cotización builder byte-for-byte
in content (identical text, positions within 1pt; see
a parity harness kept in the consuming app's repo).
**Phases 2–4 are done**: `/editor` ships `<TemplateEditor/>` — drag/resize
elements over the background PDF, scope tabs (first/middle/last), model-field
palette, table column editor bound to list fields, flow stack ordering, live
validation, and a preview mode that runs the real renderer on sample data
(WYSIWYG by construction). `/module` ships `<TemplatesModule/>` — templates
table, creation wizard (docType → page size, model, background PDF), and the
editor shell with save/validation, all persistence-agnostic via
`TemplateStorageAdapter` (a `localStorageAdapter` is included for demos).
Try it: `npm run playground`.

Remaining before first production use: publish to the Verdaccio registry
(`npm publish`), integrate in the consuming apps, and
extend i18n beyond the module strings (editor UI is Spanish-only for now).

## Entry points

| Import | Contents | Environment |
|---|---|---|
| `@pibytelabs/typeset/core` | Template types, zod schema, `parseTemplate` (with forward-only migrations), `createTemplate`, measurement, Intl formatting, `ModelDescriptor` | anywhere |
| `@pibytelabs/typeset/render` | `renderPdf`, `planLayout`, asset resolvers | Node ≥18 + browser |
| `@pibytelabs/typeset/editor` | `<TemplateEditor/>` visual designer | browser (React 19) |
| `@pibytelabs/typeset/module` | `<TemplatesModule/>` list + wizard + editor shell, `TemplateStorageAdapter` | browser (React 19) |
| `@pibytelabs/typeset/editor/styles.css` | compiled styles for editor + module (pde- prefixed, CSS-var themeable) | — |

Peer deps: `pdf-lib >= 1.17`, `zod >= 3`, optional `@pdf-lib/fontkit` (only for
custom font assets).

**Integrating into an app?** See [docs/integration.md](docs/integration.md) —
ModelDescriptor guide, storage adapter, assets contract, pdfjs worker, theming.

## Quick example

```ts
import { parseTemplate } from '@pibytelabs/typeset/core';
import { renderPdf } from '@pibytelabs/typeset/render';

const template = parseTemplate(savedTemplateJson);

const pdfBytes = await renderPdf({
  template,
  data: cotizacion,                       // plain object, dot-path bindings
  assets: { letterhead: letterheadBytes } // or an AssetResolver
});
```

## Concepts

- **Coordinates** are PDF points with a top-left origin. Page size comes from
  the template's `docType` (carta 612×792, oficio 612×936, or custom).
- **Elements** (`field | text | image | line`) are absolutely positioned and
  carry a `scope`: `first`, `middle`, `last`, or `all` pages. `anchor: 'bottom'`
  pins an element to the bottom edge (footers, signature blocks).
- **Flow** (optional): one ordered stack (`table | text-block | image-block |
  spacer`) laid out top-down inside a region. Tables grow row-atomically and
  overflow onto continuation pages (with the `middle` background and scope);
  totals footers are kept together; `last`-scope content lands on the final
  page, or a dedicated one if the flow collides with it.
- **Assets** are opaque ids — the package never stores files. Hosts provide an
  `AssetResolver` (or a byte map) for backgrounds, logos, and fonts.
- **Model binding**: hosts describe their models with a `ModelDescriptor`
  (fields + required `sample`); the editor uses it for the palette and preview,
  the renderer for formatting (`currency` → es-MX MXN via Intl, etc.).

## Development

```sh
npm install
npm test          # vitest: layout engine units + render integration
npm run typecheck
npm run build     # tsup → dist (ESM + CJS + d.ts)
```

`tests/__output__/cotizacion.pdf` is a rendered sample you can open after
running the tests.
