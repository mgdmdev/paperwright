# paperwright

Document templates that are data. A template is JSON: blocks, bindings into your data
(`{{ invoice.total | currency:GHS }}`), repeats and conditionals, a header and footer that repeat
on every page. Store it, edit it later, render it to PDF the same way every time.

```ts
import { migrateModel } from '@paperwright/model';
import { renderPdf } from '@paperwright/pdf';

const model = migrateModel(JSON.parse(templateJson));
const { bytes, warnings } = await renderPdf({ model, data: { invoice: { number: 'INV-042', lines: [...] } } });
```

## Packages

| Package | What it is |
|---|---|
| [`@paperwright/model`](packages/model) | The document model: types, Zod schema, binding syntax and filters, resolver. No React, no engine. |
| [`@paperwright/pdf`](packages/pdf) | Renders a model to PDF through Forme, with a component layer adapted from [pdfcn](https://github.com/shadcn-labs/pdfcn), two themes and the Inter font. |
| [`examples/basic`](examples/basic) | Four JSON templates (invoice, letter, payslip, certificate) with data, rendered by `pnpm examples`. |
| [`apps/composer`](apps/composer) | The drag-and-drop template composer (v0.2 spike on Puck): blocks palette, page canvas with bindings shown as chips, property panels, variable picker, live PDF panel. `pnpm composer`. |
| [`apps/playground`](apps/playground) | A local page to try templates as JSON: edit the template and data, see the PDF re-render as you type. `pnpm playground`. |

## Development

```bash
pnpm install
pnpm build        # both packages, in dependency order (tsup, with declarations)
pnpm test         # builds, then vitest across packages
pnpm examples     # renders the four example templates into examples/basic/out
pnpm composer     # http://localhost:5181 — drag-and-drop composer with a live PDF panel
pnpm playground   # http://localhost:5180 — edit template and data JSON, live PDF preview
pnpm typecheck
```

Node 22 and pnpm 11. Cross-package imports resolve to each package's `dist`, so run `pnpm build`
after editing `@paperwright/model`.

## Licence

MIT, Copyright (c) 2026 paperwright contributors. Parts of `packages/pdf/src` are adapted from
pdfcn (MIT, Copyright (c) 2026 Shadcn Labs) and Inter ships under the SIL Open Font License; both
are listed in `NOTICE`.

## Roadmap

See [ROADMAP.md](ROADMAP.md).
