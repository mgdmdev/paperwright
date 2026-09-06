import { resolveDocument } from '@docform/model';
import type { RenderInput } from '@docform/model';
import { compileBlocks, themeFor, withTheme } from './compile';
import type { CompileContext } from './compile';
import type { DocumentEngine, EngineImage, FontFace } from './engine';
import { bundledFonts } from './fonts';
import { pageGeometry } from './page';

export interface RenderPdfOptions {
  engine: DocumentEngine;
  /** Faces to register; defaults to the bundled Inter set. */
  fonts?: FontFace[];
  /**
   * Family every theme typography slot is pointed at. Defaults to the family of the first font,
   * so a theme renders with the fonts that are actually registered. Pass null to keep the
   * theme's own families (the host must register them).
   */
  fontFamily?: string | null;
  metadata?: { title?: string; author?: string; subject?: string; creator?: string; creationDate?: string };
  pdfA?: boolean;
}

export interface RenderPdfResult {
  bytes: Uint8Array;
  engine: DocumentEngine['name'];
  /** Anything the render chose not to fail on: missing data, a missing asset, an unknown theme. */
  warnings: string[];
}

/** Resolves bindings, compiles the component tree for the engine's base, and renders. */
export async function renderPdf(input: RenderInput, options: RenderPdfOptions): Promise<RenderPdfResult> {
  const { engine } = options;
  const resolved = resolveDocument(input);
  const warnings = [...resolved.warnings];

  const fonts = options.fonts ?? (await bundledFonts());
  const family = options.fontFamily === null ? undefined : (options.fontFamily ?? fonts[0]?.family);
  const theme = themeFor(input.model.theme, family, warnings);

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

  const page = pageGeometry(input.model);
  const ctx: CompileContext = {
    base: engine.base,
    theme,
    assetSrc: (hash) => srcByHash.get(hash),
    contentWidth: page.width - page.margins.left - page.margins.right,
    warnings,
  };

  const body = withTheme(ctx, compileBlocks(resolved.blocks, ctx));
  const header = resolved.header?.length ? withTheme(ctx, compileBlocks(resolved.header, ctx)) : undefined;
  const footer = resolved.footer?.length ? withTheme(ctx, compileBlocks(resolved.footer, ctx)) : undefined;

  const families = [...new Set(fonts.map((f) => f.family))];
  const bytes = await engine.render({
    body,
    header,
    footer,
    page,
    fonts,
    fontFamilies: family && !families.includes(family) ? [family, ...families] : families,
    images,
    metadata: { title: input.model.name, ...options.metadata, lang: resolved.locale },
    pdfA: options.pdfA,
  });
  return { bytes, engine: engine.name, warnings };
}
