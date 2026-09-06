// Adapted from pdfcn (https://github.com/shadcn-labs/pdfcn), MIT, Copyright (c) 2026 Shadcn Labs. See NOTICE.
import type { ReactNode } from "react";

/** CSS-like style object compatible with both Takumi and Forme */
export type Style = Record<string, unknown>;

/**
 * Base props shared by all pdfcn PDF components.
 */
export interface PDFComponentProps {
  style?: Style;
  children: ReactNode;
}
