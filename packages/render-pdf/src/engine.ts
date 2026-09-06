import type { ReactElement } from 'react';
import type { ResolvedDocument, RenderInput } from '@docform/model';

/**
 * The engine adapter. A renderer takes a resolved document, builds a React tree out of the
 * component layer in @docform/react, and hands that tree to an engine, which lays it out and
 * writes PDF bytes. Engines differ in what they can do (fixed header/footer, repeating table
 * headers, PDF/A, bidi), so the adapter is the one place those differences are allowed to show.
 */

export type EngineName = 'forme' | 'takumi';

export interface EngineCapabilities {
  fixedHeaderFooter: boolean;
  repeatingTableHeader: boolean;
  pageNumbers: boolean;
  pdfA: boolean;
  bidi: boolean;
  /** Runs in a browser worker as well as on the server. */
  browser: boolean;
}

export interface FontSource {
  family: string;
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  style?: 'normal' | 'italic';
  data: Uint8Array;
}

export interface RenderOptions {
  /** Points; taken from the model's page setup. */
  width: number;
  height: number;
  fonts?: FontSource[];
  metadata?: { title?: string; author?: string; subject?: string; creator?: string };
  pdfA?: boolean;
}

export interface DocumentEngine {
  readonly name: EngineName;
  readonly capabilities: EngineCapabilities;
  /** Lays out `tree` and returns the PDF bytes. `tree` is the page content; the engine supplies pages. */
  render(tree: ReactElement, options: RenderOptions): Promise<Uint8Array>;
}

export interface RenderPdfOptions {
  engine: DocumentEngine;
  fonts?: FontSource[];
  metadata?: RenderOptions['metadata'];
  pdfA?: boolean;
}

export interface RenderPdfResult {
  bytes: Uint8Array;
  engine: EngineName;
  /** Warnings the renderer chose not to fail on: an unsupported capability, a missing asset. */
  warnings: string[];
}

/**
 * Turns a resolved document into the React tree the engine will lay out. Exposed so the
 * live-preview page and the DOCX renderer can share it.
 */
export type CompileModel = (doc: ResolvedDocument) => ReactElement;

/** Resolves bindings, compiles, and renders. The one call a host makes. */
export type RenderPdf = (input: RenderInput, options: RenderPdfOptions) => Promise<RenderPdfResult>;
