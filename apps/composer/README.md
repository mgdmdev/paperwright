# paperwright composer

The v0.2 spike: a drag-and-drop editor over the document model, built on
[Puck](https://puckeditor.com) 0.23.

```bash
pnpm composer   # http://localhost:5181
```

- **Blocks** (left rail): every block type, grouped as Text, Data, Media and Layout. Drag one onto
  the page, into a section, a column, a repeat, an if branch.
- **Canvas**: the page at true scale (CSS points), themed from the selected preset. Bindings show
  as chips; repeat, if and keep-together show as labelled frames. It is a structural preview, not
  the PDF.
- **Fields** (right): generated from each block's fields. Text fields check `{{ }}` bindings as
  you type and carry a picker that inserts a path from the sample data at the cursor.
- **Page** (right, nothing selected): name, locale, theme, page size and margins, the header and
  footer bands, and the sample data used by the preview and the picker.
- **PDF** (left rail): the real render of the current canvas, re-done after edits settle, with
  validation issues and renderer warnings. It renders in the browser, in a Web Worker running the
  same `renderPdf` as the server; if the worker cannot load, the dev server renders instead and
  the status line says which.
- **Templates**: the dropdown lists your templates and the examples. New starts a blank one, Open… loads a
  JSON file, Duplicate copies, Delete removes. The first edit to an example forks it into your library;
  edits to your own save as you go. Publish downloads the JSON. The library is a `TemplateStore`
  (`src/store.ts`): the dev server's file store under `.paperwright/templates` when it answers,
  the browser's storage otherwise; a host implements the same four methods over its own database.
- **Images**: image and signature fields pick from known images or upload a PNG or JPEG; uploads are
  kept under `.paperwright/assets` and referenced by content hash.
- **AI…**: describe a document and get a template, or describe a change to the current one. Needs a
  language model on the dev server (see the root README); everything it returns is validated, and
  invalid answers go back for repair before you see them. An edit is saved with a note of what
  changed (blocks added, removed, changed, moved), from `diffTemplates` in `@paperwright/ai`.

The model stays the source of truth: `src/transform.ts` maps blocks to Puck components and back,
block ids survive the round trip, and the preview validates the model before rendering. The
render API is the playground's dev server plugin, shared by both apps.

Known limit: the canvas approximates the PDF's layout rather than reproducing pagination.
