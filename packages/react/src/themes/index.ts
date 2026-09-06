import { blueprintTheme } from "./themes/blueprint";
import { corporateTheme } from "./themes/corporate";
import { elegantTheme } from "./themes/elegant";
import { executiveTheme } from "./themes/executive";
import { forestTheme } from "./themes/forest";
import { minimalTheme } from "./themes/minimal";
import { modernTheme } from "./themes/modern";
import { professionalTheme } from "./themes/professional";
import { vividTheme } from "./themes/vivid";

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

export { defaultPrimitives } from "./themes/primitives";
export { professionalTheme } from "./themes/professional";
export { modernTheme } from "./themes/modern";
export { minimalTheme } from "./themes/minimal";
export { executiveTheme } from "./themes/executive";
export { corporateTheme } from "./themes/corporate";
export { elegantTheme } from "./themes/elegant";
export { vividTheme } from "./themes/vivid";
export { forestTheme } from "./themes/forest";
export { blueprintTheme } from "./themes/blueprint";

/** Map of all built-in theme presets */
export const themePresets = {
  blueprint: blueprintTheme,
  corporate: corporateTheme,
  elegant: elegantTheme,
  executive: executiveTheme,
  forest: forestTheme,
  minimal: minimalTheme,
  modern: modernTheme,
  professional: professionalTheme,
  vivid: vividTheme,
} as const;

/** Valid theme preset names */
export type ThemePresetName = keyof typeof themePresets;

/** Array of all themes with metadata */
export const THEMES = Object.entries(themePresets).map(([name, theme]) => ({
  name: name as ThemePresetName,
  theme,
  title: name.charAt(0).toUpperCase() + name.slice(1),
}));

export type RegistryTheme = (typeof THEMES)[number];
export type RegistryThemeName = RegistryTheme["name"];

export const THEME_NAMES = THEMES.map((t) => t.name) as [
  RegistryThemeName,
  ...RegistryThemeName[],
];

export const getTheme = (name: RegistryThemeName) =>
  THEMES.find((t) => t.name === name);
