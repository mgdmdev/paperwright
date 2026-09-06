// Adapted from pdfcn (https://github.com/shadcn-labs/pdfcn), MIT, Copyright (c) 2026 Shadcn Labs. See NOTICE.
import type { Style } from "@formepdf/react";
import type { ReactNode } from "react";

/** List visual style variant. */
export type ListVariant =
  | "bullet"
  | "numbered"
  | "checklist"
  | "icon"
  | "multi-level"
  | "descriptive";

/**
 * A single list item, optionally with nested children.
 * Props - `text` | `description` | `checked` | `children`
 * @see {@link ListItem}
 */
export interface ListItem {
  /** Plain text, or formatted runs (Text, Strong, Link) — every variant renders it inside a Text. */
  text: ReactNode;
  description?: string;
  checked?: boolean;
  children?: ListItem[];
}

/**
 * List of items with multiple style variants including bullet, numbered, checklist, and descriptive.
 * Props - `items` | `variant` | `gap` | `style` | `_level` | `noWrap`
 * @see {@link PdfListProps}
 */
export interface PdfListProps {
  items: ListItem[];
  /**
   * @default 'bullet'
   */
  variant?: ListVariant;
  /**
   * @default 'sm'
   */
  gap?: "xs" | "sm" | "md";
  style?: Style;
  _level?: number;
  /**
   * @default false
   */
  noWrap?: boolean;
}
