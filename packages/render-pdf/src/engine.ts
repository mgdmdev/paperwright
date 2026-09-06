import type { ReactElement } from 'react';

/**
 * The engine adapter. The compiler builds React trees out of the component layer in
 * @docform/react for the base an engine renders, and the engine lays them out into PDF bytes.
 * Engines differ in what they can do, so the adapter is the one place those differences show.
 */

export type EngineName = 'forme' | 'takumi';

/** Which component base of @docform/react an engine consumes. */
export type Base = 'forme' | 'takumi';

export interface EngineCapabilities {
  fixedHeaderFooter: boolean;
  repeatingTableHeader: boolean;
  pageNumbers: boolean;
  pdfA: boolean;
  /** Draws SVG image assets. */
  svg: boolean;
  bidi: boolean;
  /** Runs in a browser worker as well as on the server. */
  browser: boolean;
}

export interface FontFace {
  family: string;
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  style: 'normal' | 'italic';
  data: Uint8Array;
}

export interface EngineImage {
  /** The src the compiled tree refers to; see CompileContext.assetSrc. */
  src: string;
  mime: 'image/png' | 'image/jpeg' | 'image/svg+xml';
  data: Uint8Array;
}

/** Points. Orientation is already applied: width and height are the sheet as printed. */
export interface PageGeometry {
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number };
}

export interface DocumentMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  /** UTC, `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SS`. PDF/A requires one; supplying it keeps output deterministic. */
  creationDate?: string;
  /** BCP 47. */
  lang: string;
}

/** What the compiler hands an engine: trees for the body and the repeating bands, plus resources. */
export interface EngineDocument {
  body: ReactElement;
  header?: ReactElement;
  footer?: ReactElement;
  page: PageGeometry;
  fonts: FontFace[];
  /** Ordered family names for the fallback chain; the first is the document default. */
  fontFamilies: string[];
  images: EngineImage[];
  metadata: DocumentMetadata;
  pdfA?: boolean;
}

export interface DocumentEngine {
  readonly name: EngineName;
  readonly base: Base;
  readonly capabilities: EngineCapabilities;
  /** How the compiled tree must refer to an image so this engine finds it. */
  imageSrc(image: EngineImage): string;
  render(doc: EngineDocument): Promise<Uint8Array>;
}
