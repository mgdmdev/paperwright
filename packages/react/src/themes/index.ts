import { blueprintTheme } from "./blueprint";
import { corporateTheme } from "./corporate";
import { elegantTheme } from "./elegant";
import { executiveTheme } from "./executive";
import { forestTheme } from "./forest";
import { minimalTheme } from "./minimal";
import { modernTheme } from "./modern";
import { professionalTheme } from "./professional";
import { vividTheme } from "./vivid";

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
export { modernTheme } from "./modern";
export { minimalTheme } from "./minimal";
export { executiveTheme } from "./executive";
export { corporateTheme } from "./corporate";
export { elegantTheme } from "./elegant";
export { vividTheme } from "./vivid";
export { forestTheme } from "./forest";
export { blueprintTheme } from "./blueprint";

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
