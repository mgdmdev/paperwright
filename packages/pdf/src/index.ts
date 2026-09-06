// Rendering
export { renderPdf } from './render/render';
export type { RenderPdfOptions, RenderPdfResult } from './render/render';
export { createFormeEngine } from './render/forme';
export * from './render/engine';
export { compileBlocks, withTheme, themeFor, withFontFamily, mergeTheme, columnFractions } from './render/compile';
export type { CompileContext, ThemeOverrides } from './render/compile';
export { bundledFonts } from './fonts';
export { pageGeometry, PT_TO_PX } from './render/page';

// Component layer (adapted from pdfcn's Forme base, with paperwright's changes)
export * from './themes/index';
export { PdfcnThemeContext, PdfcnThemeProvider, usePdfcnTheme, useSafeMemo, mergePdfStyles } from './components/theme-provider';
export type { PdfcnThemeProviderProps } from './components/theme-provider';
export { resolveTree } from './lib/resolve-tree';
export * as primitives from './lib/pdf-primitives';
export * from './lib/resolve-color';
export * from './components/divider/divider';
export * from './components/heading/heading';
export * from './components/keep-together/keep-together';
export * from './components/key-value/key-value';
export * from './components/list/list';
export * from './components/list/list.types';
export * from './components/page-number/page-number';
export * from './components/pdf-image/pdf-image';
export * from './components/qrcode/qrcode';
export * from './components/section/section';
export * from './components/signature/signature';
export { createTableStyles } from './components/table/table.styles';
export * from './components/text/text';
export * from './components/watermark/watermark';
