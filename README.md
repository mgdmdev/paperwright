# docform

One document model. A builder. Renderers to PDF and DOCX. Built on [pdfcn](https://github.com/shadcn-labs/pdfcn).

A template is data: a JSON document (`@docform/model`) that renders to PDF through an engine
adapter (`@docform/render-pdf`, Forme or Takumi) and, later, to DOCX through `@docform/render-docx`,
using a component layer (`@docform/react`) taken from pdfcn. A drag-and-drop builder and a Word
importer follow in later releases.

Status: v0.1 in progress — model, PDF rendering on both engines, three example templates, fixtures.

## Packages

| Package | What |
|---|---|
| `@docform/model` | the document model: types, Zod schema, binding evaluator, migrations |
| `@docform/react` | document components for both engines, themes |
| `@docform/render-pdf` | `renderPdf(input)` — model to PDF through the engine adapter |

## Licence

MIT. See NOTICE for the vendored pdfcn component layer.
