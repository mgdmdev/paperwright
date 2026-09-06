import { minimalTheme } from "./minimal";
import { professionalTheme } from "./professional";

export type { PDFComponentProps, Style } from "../types/pdf-components";
export type {
  PdfcnTheme,
  PrimitiveTokens,
  ColorTokens,
  TypographyTokens,
  SpacingTokens,
  PageTokens,
  TypographyScale,
  SpacingScale,
  FontWeights,
  LineHeights,
  BorderRadiusScale,
  LetterSpacingScale,
} from "../types/pdf-themes";

export { defaultPrimitives } from "./primitives";
export { professionalTheme } from "./professional";
export { minimalTheme } from "./minimal";

/** The built-in themes. A host can pass its own PdfcnTheme object instead of a name. */
export const themePresets = {
  minimal: minimalTheme,
  professional: professionalTheme,
} as const;

export type ThemePresetName = keyof typeof themePresets;
