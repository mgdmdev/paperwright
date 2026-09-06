import { createContext, useContext } from "react";
import type { DependencyList, ReactNode } from "react";

import { professionalTheme } from "../../themes/professional";

export type PdfcnTheme = typeof professionalTheme;

export interface PdfcnThemeProviderProps {
  theme?: PdfcnTheme;
  children: ReactNode;
}

/**
 * Takumi walks JSX with a hook dispatcher of its own, so React context works there and nested
 * providers scope correctly. The module-level fallback only serves a walker that calls
 * components bare, where `useContext` throws.
 */
export const PdfcnThemeContext = createContext<PdfcnTheme>(professionalTheme);

let fallbackTheme: PdfcnTheme = professionalTheme;

export const PdfcnThemeProvider = ({
  theme,
  children,
}: PdfcnThemeProviderProps) => {
  const resolved = theme ?? professionalTheme;
  fallbackTheme = resolved;
  return (
    <PdfcnThemeContext.Provider value={resolved}>
      {children}
    </PdfcnThemeContext.Provider>
  );
};

export const usePdfcnTheme = (): PdfcnTheme => {
  try {
    return useContext(PdfcnThemeContext);
  } catch {
    return fallbackTheme;
  }
};

export const useSafeMemo = <T,>(factory: () => T, _deps: DependencyList): T =>
  factory();
