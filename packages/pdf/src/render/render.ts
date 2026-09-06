import { resolveDocument } from '@paperwright/model';
import type { RenderInput } from '@paperwright/model';
import { bundledFonts } from '../fonts';
import { compileBlocks, themeFor, withTheme } from './compile';
import type { CompileContext, ThemeOverrides } from './compile';
import type { PdfcnTheme } from '../themes/index';
import type { DocumentEngine, EngineImage, FontFace } from './engine';
import { createFormeEngine } from './forme';
import { pageGeometry } from './page';

export interface RenderPdfOptions {
  /** Defaults to Forme. */
  engine?: DocumentEngine;
  /** Faces to register; defaults to the bundled Inter set (Node only; pass your own in a browser). */
  fonts?: FontFace[];
  /**
   * Family every theme typography slot is pointed at. Defaults to the family of the first font,
   * so a theme renders with the fonts that are actually registered. Pass null to keep the
   * theme's own families (the host must register them).
   */
  fontFamily?: string | null;
  /** A preset name or a full theme object; wins over the model's `theme`. */
  theme?: string | PdfcnTheme;
  /** Deep overrides applied last: a tenant's colours, a font family, spacing. */
  themeOverrides?: ThemeOverrides;
  metadata?: { title?: string; author?: string; subject?: string; creator?: string };
  pdfA?: boolean;
}

export interface RenderPdfResult {
  bytes: Uint8Array;
  engine: string;
  /** Anything the render chose not to fail on: missing data, a missing asset, an unknown theme. */
  warnings: string[];
}

let defaultEngine: DocumentEngine | undefined;

/** Resolves bindings, compiles the component tree, and renders. The one call a host makes. */
export async function renderPdf(input: RenderInput, options: RenderPdfOptions = {}): Promise<RenderPdfResult> {
  const engine = options.engine ?? (defaultEngine ??= createFormeEngine());
  const resolved = resolveDocument(input);
  const warnings = [...resolved.warnings];

  const fonts = options.fonts ?? (await bundledFonts());
  const family = options.fontFamily === null ? undefined : (options.fontFamily ?? fonts[0]?.family);
  const theme = themeFor(options.theme ?? input.model.theme, family, warnings, options.themeOverrides);

  const assetBytes = input.assets ?? new Map<string, Uint8Array>();
  const images: EngineImage[] = [];
  const srcByHash = new Map<string, string>();
  for (const asset of input.model.assets) {
    const data = assetBytes.get(asset.hash);
    if (!data) continue;
    if (asset.mime === 'image/svg+xml' && !engine.capabilities.svg) {
      warnings.push(`Asset ${asset.hash} is SVG, which the ${engine.name} engine cannot draw`);
      continue;
    }
    const image: EngineImage = { src: asset.hash, mime: asset.mime, data };
    images.push(image);
    srcByHash.set(asset.hash, engine.imageSrc(image));
  }

  const ctx: CompileContext = { theme, assetSrc: (hash) => srcByHash.get(hash), flow: true, warnings };
  const band: CompileContext = { ...ctx, flow: false };
  const body = withTheme(ctx, compileBlocks(resolved.blocks, ctx));
  const header = resolved.header?.length ? withTheme(ctx, compileBlocks(resolved.header, band)) : undefined;
  const footer = resolved.footer?.length ? withTheme(ctx, compileBlocks(resolved.footer, band)) : undefined;

  const families = [...new Set(fonts.map((f) => f.family))];
  const bytes = await engine.render({
    body,
    header,
    footer,
    page: pageGeometry(input.model),
    fonts,
    fontFamilies: family && !families.includes(family) ? [family, ...families] : families,
    images,
    metadata: { title: input.model.name, ...options.metadata, lang: resolved.locale },
    pdfA: options.pdfA,
  });
  return { bytes, engine: engine.name, warnings };
}
