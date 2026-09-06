/**
 * The paperwright document model.
 *
 * A template is data. This file is the contract every other package renders from, edits, or
 * imports into, so it changes under semver more strictly than any code: a breaking change here
 * breaks every stored template. `DocumentModel.version` and the migrations in ./migrations are how
 * old templates keep opening.
 *
 * Units are PDF points (1/72 inch) throughout. Pagination is the renderer's job: nothing in the
 * model says where a page ends, only what must stay together and what must start a new page.
 */

export type SchemaVersion = 1;

export type PageSize = 'A4' | 'Letter' | 'Legal' | { width: number; height: number };

export interface PageSetup {
  size: PageSize;
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
}

/** A formatting step applied to a bound value, evaluated left to right. */
export interface Filter {
  name: 'date' | 'number' | 'currency' | 'upper' | 'lower' | 'default' | 'join';
  args?: Record<string, string>;
}

/**
 * A reference into the host's data, e.g. `employee.name` or `line.amount` inside a repeat.
 * A plain string can carry the same thing inline as `{{ employee.name | upper }}`.
 */
export interface Binding {
  var: string;
  filters?: Filter[];
}

export type BindingOrString = string | Binding;

export interface Span {
  text: BindingOrString;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  link?: BindingOrString;
}

export interface RichText {
  spans: Span[];
  align?: 'left' | 'center' | 'right' | 'justify';
}

/** An image the template refers to by content hash; the bytes travel separately. */
export interface Asset {
  hash: string;
  mime: 'image/png' | 'image/jpeg' | 'image/svg+xml';
  width?: number;
  height?: number;
}

interface BlockBase {
  id: string;
}

export interface HeadingBlock extends BlockBase {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: BindingOrString;
  keepWithNext?: boolean;
}

export interface TextBlock extends BlockBase {
  type: 'text';
  rich: RichText;
}

export interface DividerBlock extends BlockBase {
  type: 'divider';
  variant?: 'solid' | 'dashed';
}

export interface ImageBlock extends BlockBase {
  type: 'image';
  assetHash: string;
  width?: number;
  height?: number;
  fit?: 'contain' | 'cover';
  align?: 'left' | 'center' | 'right';
  caption?: BindingOrString;
}

export interface QrBlock extends BlockBase {
  type: 'qrcode';
  value: BindingOrString;
  size?: number;
  align?: 'left' | 'center' | 'right';
}

export interface KeyValueBlock extends BlockBase {
  type: 'keyValue';
  items: { key: BindingOrString; value: BindingOrString }[];
}

export interface ListBlock extends BlockBase {
  type: 'list';
  variant: 'bullet' | 'numbered';
  items: RichText[];
}

export interface TableColumn {
  key: string;
  header: BindingOrString;
  /** Fraction of the table width; columns without one share what is left. */
  width?: number;
  align?: 'left' | 'center' | 'right';
}

/** A table whose rows are written in the template. */
export interface TableBlock extends BlockBase {
  type: 'table';
  columns: TableColumn[];
  rows: BindingOrString[][];
  variant?: 'line' | 'grid' | 'bordered' | 'striped' | 'compact' | 'minimal';
}

/** A table whose rows come from the data: one row per element of `rowBinding`. */
export interface DataTableBlock extends BlockBase {
  type: 'dataTable';
  columns: (TableColumn & { cell: BindingOrString })[];
  /** Path to an array in the data; `cell` bindings resolve relative to each element. */
  rowBinding: string;
  variant?: TableBlock['variant'];
  emptyText?: BindingOrString;
}

export interface SectionBlock extends BlockBase {
  type: 'section';
  title?: BindingOrString;
  blocks: Block[];
}

/** Repeats its blocks once per element of `forEach`, binding each element as `as`. */
export interface RepeatBlock extends BlockBase {
  type: 'repeat';
  forEach: string;
  as: string;
  blocks: Block[];
}

/** Renders `then` when the bound value is truthy, otherwise `else`. */
export interface IfBlock extends BlockBase {
  type: 'if';
  test: Binding;
  then: Block[];
  else?: Block[];
}

export interface KeepTogetherBlock extends BlockBase {
  type: 'keepTogether';
  blocks: Block[];
}

/** A signing line with the signer's details; with an asset, the stored signature is drawn above it. */
export interface SignatureBlock extends BlockBase {
  type: 'signature';
  assetHash?: string;
  signer: { name?: BindingOrString; title?: BindingOrString; date?: BindingOrString };
  variant?: 'single' | 'inline';
}

export interface WatermarkBlock extends BlockBase {
  type: 'watermark';
  text: BindingOrString;
  opacity?: number;
}

export interface PageNumberBlock extends BlockBase {
  type: 'pageNumber';
  /** `{page}` and `{total}` are substituted by the renderer. */
  format?: string;
  align?: 'left' | 'center' | 'right';
}

export type Block =
  | HeadingBlock
  | TextBlock
  | DividerBlock
  | ImageBlock
  | QrBlock
  | KeyValueBlock
  | ListBlock
  | TableBlock
  | DataTableBlock
  | SectionBlock
  | RepeatBlock
  | IfBlock
  | KeepTogetherBlock
  | SignatureBlock
  | WatermarkBlock
  | PageNumberBlock;

export type BlockType = Block['type'];

export interface DocumentModel {
  version: SchemaVersion;
  id: string;
  name: string;
  /** BCP 47; the default for date, number and currency filters. */
  locale: string;
  page: PageSetup;
  /** Theme name from @paperwright/pdf, or undefined for the default. */
  theme?: string;
  /** Rendered on every page. */
  header?: Block[];
  footer?: Block[];
  blocks: Block[];
  assets: Asset[];
}

/** What the host supplies at render time. */
export type RenderData = Record<string, unknown>;
export type AssetBytes = Map<string, Uint8Array>;

export interface RenderInput {
  model: DocumentModel;
  data: RenderData;
  assets?: AssetBytes;
  /** Overrides the model's locale for this render. */
  locale?: string;
}

/** A model with every binding, repeat and conditional resolved: what a renderer actually draws. */
export interface ResolvedDocument {
  model: DocumentModel;
  blocks: ResolvedBlock[];
  header?: ResolvedBlock[];
  footer?: ResolvedBlock[];
  locale: string;
}

/**
 * A block after resolution: the same shape with every BindingOrString replaced by a string.
 * Repeat and if are expanded away and a dataTable becomes a table with its rows filled in.
 */
export type ResolvedBlock = Exclude<Block, RepeatBlock | IfBlock | DataTableBlock>;
