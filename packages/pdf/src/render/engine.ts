import type { ReactElement } from 'react';

/**
 * The engine boundary. The compiler builds a React tree out of the component layer and an
 * engine lays it out into PDF bytes. One engine ships (Forme); the interface is what a second one
 * would implement, and it keeps engine-specific assembly out of the compiler.
 */

export interface EngineCapabilities {
  fixedHeaderFooter: boolean;
  repeatingTableHeader: boolean;
  pageNumbers: boolean;
  pdfA: boolean;
  /** Draws SVG image assets. */
  svg: boolean;
  bidi: boolean;
}

export interface FontFace {
  family: string;
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  style: 'normal' | 'italic';
  data: Uint8Array;
}

export interface EngineImage {
  /** The asset hash; the engine decides how the tree refers to it (see imageSrc). */
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
  readonly name: string;
  readonly capabilities: EngineCapabilities;
  /** How the compiled tree must refer to an image so this engine finds it. */
  imageSrc(image: EngineImage): string;
  render(doc: EngineDocument): Promise<Uint8Array>;
}
