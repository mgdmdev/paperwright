# @paperwright/render-pdf

Renders a docform model to PDF through an engine adapter.

```ts
import { createFormeEngine, createTakumiEngine, renderPdf } from '@paperwright/render-pdf';

const { bytes, warnings } = await renderPdf(
  { model, data, assets: new Map([[hash, pngBytes]]) },
  { engine: createFormeEngine() },
);
```

`renderPdf` resolves bindings, picks the theme, compiles the blocks to the component tree of the
engine's base, and calls the engine. Options: `fonts` (defaults to the bundled Inter faces),
`fontFamily` (every theme typography slot is pointed at it; pass `null` to keep the theme's own
families and register them yourself), `metadata`, `pdfA`.

## Engine adapter

```ts
interface DocumentEngine {
  name: 'forme' | 'takumi';
  base: 'forme' | 'takumi';          // which @paperwright/react component base it consumes
  capabilities: EngineCapabilities;
  imageSrc(image: EngineImage): string;
  render(doc: EngineDocument): Promise<Uint8Array>;
}
```

The compiler hands an engine the body tree, the header and footer trees, page geometry in points,
fonts, images and metadata. Each engine assembles its own document: Forme wraps the body in
`<Document><Page>` with `<Fixed>` bands; Takumi passes the bands as render options, measures
them, and grows the page margin to fit.

Tables compile to each engine's native table so the header row repeats on every page the table
continues onto; the theme's table styles are applied to both.

## Known issue: Takumi and poppler

PDFs from the Takumi engine show glyph-spacing artifacts ("In voice", "Emp loyee") and text
running past the right margin when rasterized by poppler (`pdftoppm`, evince, and other
poppler-based viewers). Quartz (macOS Preview) and pdf.js render the same files correctly, the
declared glyph widths match the embedded font, and stripping hinting tables changes nothing. The
content stream positions glyphs with `TJ` adjustments under a vertically flipped text matrix,
which is where poppler and the other renderers part ways. This is upstream behaviour (present in
takumi-pdf 0.11 and 0.14), not something the adapter can correct. Prefer Forme where poppler-based
viewing matters.

## Tests

`pnpm test` renders the three example templates on both engines and compares the text layer per
page, read back through pdf.js, against golden snapshots in `test/__snapshots__`.
