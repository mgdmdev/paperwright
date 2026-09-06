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
  validation issues and renderer warnings.
- **Publish**: downloads the template as JSON. Templates load from `examples/basic`.

The model stays the source of truth: `src/transform.ts` maps blocks to Puck components and back,
block ids survive the round trip, and the preview validates the model before rendering. The
render API is the playground's dev server plugin, shared by both apps.

Known limits of the spike: assets are the example images only (no upload yet); list items are
plain text in the editor; the canvas approximates the PDF's layout rather than reproducing it.
