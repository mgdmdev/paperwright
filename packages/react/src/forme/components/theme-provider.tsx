import { View } from "@formepdf/react";
import type { Style } from "@formepdf/react";
import { Fragment, createContext, isValidElement, useContext } from "react";
import type { DependencyList, ReactNode } from "react";

import { professionalTheme } from "../../themes/professional";

export type PdfcnTheme = typeof professionalTheme;

export interface PdfcnThemeProviderProps {
  theme?: PdfcnTheme;
  children: ReactNode;
}

type PdfStyleInput = Style | PdfStyleInput[] | false | null | undefined;

const mergeStyleInput = (target: Style, input: PdfStyleInput): void => {
  if (Array.isArray(input)) {
    for (const item of input) {
      mergeStyleInput(target, item);
    }
  } else if (input) {
    Object.assign(target, input);
  }
};

export const mergePdfStyles = (...inputs: PdfStyleInput[]): Style => {
  const merged: Style = {};
  for (const input of inputs) {
    mergeStyleInput(merged, input);
  }
  return merged;
};

export const PdfcnThemeContext = createContext<PdfcnTheme>(professionalTheme);

let fallbackTheme: PdfcnTheme = professionalTheme;

/**
 * Forme's own `serialize()` calls components bare, with no hook dispatcher, so a Provider element
 * would reach it unexpanded. Under a dispatcher (React itself, or `resolveTree` from this
 * package) a real Provider is used and nested providers scope correctly; without one the
 * provider falls back to the module-level value and expands its child in place, which is safe
 * because that walk is synchronous.
 */
const hasDispatcher = (): boolean => {
  try {
    useContext(PdfcnThemeContext);
    return true;
  } catch {
    return false;
  }
};

/**
 * Under a bare walk the provider cannot expand its child itself (Forme resolves whatever element it
 * returns), so it returns a single element unchanged and wraps anything else, arrays and fragments
 * included, in a View that Forme serializes by identity.
 */
const expandBare = (children: ReactNode): ReactNode => {
  if (isValidElement(children) && children.type !== Fragment) {
    return children;
  }
  return <View>{children}</View>;
};

export const PdfcnThemeProvider = ({
  theme,
  children,
}: PdfcnThemeProviderProps) => {
  const resolved = theme ?? professionalTheme;
  fallbackTheme = resolved;
  if (!hasDispatcher()) {
    return expandBare(children);
  }
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
