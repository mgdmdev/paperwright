# @docform/react

The document component layer docform renders with, for both engines, plus the themes.

```ts
import { forme, takumi, themePresets } from '@docform/react';
```

`forme.*` and `takumi.*` expose the same components (`Heading`, `Text`, `Table`, `KeyValue`,
`PdfImage`, `PdfQRCode`, `PdfSignatureBlock`, `PageHeader`, `PageFooter`, `PageNumber`,
`PdfWatermark`, ...), each written against its engine's primitives. `themePresets` holds the nine
built-in themes; every component reads the theme from `PdfcnThemeProvider`.

The components are vendored from [pdfcn](https://github.com/shadcn-labs/pdfcn) (MIT). Changes
docform carries on top of upstream:

- **Theme provider on React context.** Upstream kept the active theme in a module-level variable,
  which breaks under concurrent renders and nested providers. Both bases now use `createContext`,
  with the module-level value only as a fallback for a walker that calls components bare.
- **`forme.resolveTree(element)`.** Forme's `serialize()` calls components without a hook
  dispatcher, so context cannot reach them. `resolveTree` expands every component to Forme
  primitives first, with a dispatcher that supports `useContext`, `useMemo`, `useRef` and the
  rest, then hands the primitive tree to `serialize()`. `@docform/render-pdf` does this for you.
- **Takumi `PageHeader` and `PageFooter` forward `fixed`.** Upstream declared the prop and never
  used it.
- **Signature block `image` prop** for a captured signature drawn above the line.
- **`createTableStyles` exported** from both bases, so a renderer can style native tables (which
  repeat their header row across pages) with the theme.

Blocks (the sample invoice and report documents) are vendored but not exported.
