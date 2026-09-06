# @paperwright/pdf

Renders a paperwright document model to PDF.

```ts
import { renderPdf } from '@paperwright/pdf';

const { bytes, warnings } = await renderPdf({ model, data, assets: new Map([[hash, pngBytes]]) });
```

`renderPdf` resolves the bindings, picks the theme, compiles the blocks to the component tree and
hands it to the engine. Options: `fonts` (defaults to the bundled Inter faces; Node only, so pass
your own in a browser), `fontFamily` (every theme typography slot is pointed at it; `null` keeps
the theme's own families, which you must then register), `theme` (a preset name or a theme
object, winning over the model's), `themeOverrides` (a deep partial applied last: a tenant's
colours, a font family, spacing between blocks; page size and margins stay with the model),
`metadata`, `pdfA`, `engine`.

```ts
await renderPdf(input, { themeOverrides: { colors: { primary: '#7a1f1f' }, typography: { heading: { fontFamily: 'Brand Serif' } } }, fonts });
```

## Engine

One engine ships: [Forme](https://www.npmjs.com/package/@formepdf/core). Pages, fixed header and
footer bands, page-number placeholders and repeating table header rows are native to it. The
`DocumentEngine` interface is the seam a second engine would implement; it keeps engine-specific
assembly (fonts, images, page setup) out of the compiler.

Tables compile to Forme's native table so the header row repeats on every page the table
continues onto, styled from the theme's table styles.

## Component layer

The components (`Heading`, `Text`, `KeyValue`, `PdfList`, `PdfImage`, `PdfQRCode`,
`PdfSignatureBlock`, `PageNumber`, `PdfWatermark`, `Section`, `KeepTogether`, `Divider`) and the
two themes (`professional`, `minimal`) are vendored from [pdfcn](https://github.com/shadcn-labs/pdfcn)'s
Forme base (MIT, see `NOTICE`), trimmed to what the compiler uses. Changes carried on top of
upstream:

- **Theme provider on React context.** Upstream kept the active theme in a module-level variable,
  which breaks under concurrent renders and nested providers.
- **`resolveTree(element)`.** Forme's `serialize()` calls components without a hook dispatcher, so
  context cannot reach them. `resolveTree` expands every component to Forme primitives first, with
  a dispatcher that supports `useContext`, `useMemo`, `useRef`, `useMemoCache` and the rest.
  `renderPdf` does this for you.
- **Signature block `image` prop** for a stored signature drawn above the line.
- **`createTableStyles` exported** so the renderer can style native tables with the theme.

## Tests

`pnpm test` renders the four example templates (invoice, letter, payslip, certificate) and compares the text layer per page, read back
through pdf.js, against golden snapshots in `test/__snapshots__`.
