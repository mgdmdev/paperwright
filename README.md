# docform

One document model, rendered to PDF through pluggable engines, with a React component layer
built on [pdfcn](https://github.com/shadcn-labs/pdfcn). A template is JSON: blocks, bindings into
your data (`{{ invoice.total | currency:GHS }}`), repeats and conditionals, a header and footer
that repeat on every page. The same template renders on either engine.

```ts
import { migrateModel } from '@docform/model';
import { createFormeEngine, renderPdf } from '@docform/render-pdf';

const model = migrateModel(JSON.parse(templateJson));
const { bytes, warnings } = await renderPdf(
  { model, data: { invoice: { number: 'INV-042', lines: [...] } } },
  { engine: createFormeEngine() },
);
```

## Packages

| Package | What it is |
|---|---|
| [`@docform/model`](packages/model) | The document model: types, Zod schema, binding syntax and filters, resolver, migrations. No React, no engine. |
| [`@docform/react`](packages/react) | The component layer for both engines (vendored from pdfcn, with fixes), themes, and a context-aware tree resolver for Forme. |
| [`@docform/render-pdf`](packages/render-pdf) | Compiles a resolved model to the component tree and renders it through an engine adapter. Ships Forme and Takumi engines and the Inter font. |
| [`examples/basic`](examples/basic) | Three JSON templates (invoice, letter, payslip) with data, rendered on both engines by `pnpm examples`. |

## Engines

| | Forme (`@formepdf/core`) | Takumi (`takumi-pdf`) |
|---|---|---|
| Fixed header and footer | native `<Fixed>` | render-option bands |
| Page numbers | `{{pageNumber}}` placeholders | counter primitives |
| Repeating table header | native | native (`<thead>`) |
| PDF/A | yes | yes |
| Browser | yes | yes |
| Known issue | | Output shows glyph-spacing artifacts in poppler-based viewers (pdftoppm, evince); Quartz and pdf.js render it correctly. See `packages/render-pdf/README.md`. |

Forme is the default recommendation. Both engines pass the same golden tests.

## Development

```bash
pnpm install
pnpm build        # every package, in dependency order (tsup, with declarations)
pnpm test         # builds, then vitest across packages
pnpm examples     # renders examples/basic/templates/*.json on both engines into examples/basic/out
pnpm typecheck
```

Node 22 and pnpm 11. Cross-package imports resolve to each package's `dist`, so run `pnpm build`
after editing a package another one depends on.

## Roadmap

- v0.1 — model, PDF through the adapter on both engines, component layer, three example templates, golden tests. **This release.**
- v0.2 — the builder: a drag-and-drop canvas over the model.
- v0.3 — DOCX as an editable export, rendered from the same model; signature slots with an e-sign field manifest.
- v0.4 — Word import as a draft importer with a confirmation screen.

## Licence

MIT. The component layer under `packages/react/src/{takumi,forme,themes,types}` is vendored from
pdfcn (MIT, see `NOTICE`). Inter is shipped under the SIL Open Font License
(`packages/render-pdf/fonts/LICENSE-Inter.txt`).
