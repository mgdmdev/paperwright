import type { Slot } from '@puckeditor/core';
import type { Block, DocumentModel, RichText, Span } from '@paperwright/model';
import type { ComposerData } from './puck';

/**
 * Two-way mapping between the document model and Puck's data. The model is the source of truth;
 * Puck's shape (components with props, slots as arrays of components) is only what the canvas
 * edits. Block ids become component ids and survive the round trip.
 */

/** A placed component as the transform sees it; Puck fills `id` for anything it places itself. */
export type Component = { type: string; props: Record<string, unknown> & { id?: string } };

export interface RootProps extends Record<string, unknown> {
  name: string;
  locale: string;
  theme: string;
  pageSize: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  header: Slot;
  footer: Slot;
  /** Sample data for the preview and the variable picker; not part of the model. */
  sampleData: string;
}

let counter = 0;
const newId = (type: string) => `${type}-${Date.now().toString(36)}${(counter++).toString(36)}`;

const text = (t: RichText) => ({ spans: t.spans.map((s) => ({ text: String(s.text), bold: !!s.bold, italic: !!s.italic, underline: !!s.underline, link: String(s.link ?? ''), color: s.color ?? '' })), align: t.align ?? 'left' });

const toSpans = (spans: { text: string; bold?: boolean; italic?: boolean; underline?: boolean; link?: string; color?: string }[]): Span[] =>
  spans.map((s) => {
    const span: Span = { text: s.text };
    if (s.bold) span.bold = true;
    if (s.italic) span.italic = true;
    if (s.underline) span.underline = true;
    if (s.link) span.link = s.link;
    if (s.color) span.color = s.color;
    return span;
  });

const str = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : JSON.stringify(v));
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const opt = <T,>(v: T | '' | undefined | null): T | undefined => (v === '' || v === undefined || v === null ? undefined : v);

// ─── model → Puck ─────────────────────────────────────────────────────────────

export function blockToComponent(block: Block): Component {
  const id = block.id;
  switch (block.type) {
    case 'heading':
      return { type: 'Heading', props: { id, level: block.level, text: str(block.text), align: block.align ?? 'left', keepWithNext: !!block.keepWithNext } };
    case 'text':
      return { type: 'Text', props: { id, ...text(block.rich) } };
    case 'divider':
      return { type: 'Divider', props: { id, variant: block.variant ?? 'solid' } };
    case 'image':
      return { type: 'Image', props: { id, assetHash: block.assetHash, width: block.width ?? 120, height: block.height ?? 0, fit: block.fit ?? 'contain', align: block.align ?? 'left', caption: str(block.caption) } };
    case 'qrcode':
      return { type: 'QRCode', props: { id, value: str(block.value), size: block.size ?? 72, align: block.align ?? 'left' } };
    case 'keyValue':
      return { type: 'KeyValue', props: { id, items: block.items.map((i) => ({ key: str(i.key), value: str(i.value) })) } };
    case 'list':
      return { type: 'List', props: { id, variant: block.variant, items: block.items.map((i) => ({ spans: text(i).spans })) } };
    case 'table':
      return { type: 'Table', props: { id, variant: block.variant ?? 'line', columns: block.columns.map((c) => ({ key: c.key, header: str(c.header), width: c.width ?? 0, align: c.align ?? 'left' })), rows: block.rows.map((r) => ({ cells: r.map((c) => ({ value: str(c) })) })) } };
    case 'dataTable':
      return { type: 'DataTable', props: { id, rowBinding: block.rowBinding, variant: block.variant ?? 'line', emptyText: str(block.emptyText), columns: block.columns.map((c) => ({ key: c.key, header: str(c.header), cell: str(c.cell), width: c.width ?? 0, align: c.align ?? 'left' })) } };
    case 'section':
      return { type: 'Section', props: { id, title: str(block.title), content: block.blocks.map(blockToComponent) } };
    case 'columns':
      return { type: 'Columns', props: { id, gap: block.gap ?? 0, align: block.align ?? 'top', columns: block.columns.map((c) => ({ width: c.width ?? 0, content: c.blocks.map(blockToComponent) })) } };
    case 'repeat':
      return { type: 'Repeat', props: { id, forEach: block.forEach, as: block.as, content: block.blocks.map(blockToComponent) } };
    case 'if':
      return { type: 'If', props: { id, test: block.test.var, whenTrue: block.then.map(blockToComponent), whenFalse: (block.else ?? []).map(blockToComponent) } };
    case 'keepTogether':
      return { type: 'KeepTogether', props: { id, content: block.blocks.map(blockToComponent) } };
    case 'pageBreak':
      return { type: 'PageBreak', props: { id } };
    case 'signature':
      return { type: 'Signature', props: { id, variant: block.variant ?? 'single', assetHash: block.assetHash ?? '', name: str(block.signer.name), title: str(block.signer.title), date: str(block.signer.date) } };
    case 'watermark':
      return { type: 'Watermark', props: { id, text: str(block.text), opacity: block.opacity ?? 0.08 } };
    case 'pageNumber':
      return { type: 'PageNumber', props: { id, format: block.format ?? 'Page {page} of {total}', align: block.align ?? 'center' } };
  }
}

/** Puck types every placed component by name; the transform builds them generically and asserts once here. */
const asSlot = (components: Component[]): Slot => components as unknown as Slot;

export function modelToData(model: DocumentModel, sampleData: unknown): ComposerData {
  return {
    root: {
      props: {
        name: model.name,
        locale: model.locale,
        theme: model.theme ?? 'professional',
        pageSize: typeof model.page.size === 'string' ? model.page.size : 'A4',
        orientation: model.page.orientation,
        marginTop: model.page.margins.top,
        marginRight: model.page.margins.right,
        marginBottom: model.page.margins.bottom,
        marginLeft: model.page.margins.left,
        header: asSlot((model.header ?? []).map(blockToComponent)),
        footer: asSlot((model.footer ?? []).map(blockToComponent)),
        sampleData: JSON.stringify(sampleData ?? {}, null, 2),
      },
    },
    content: asSlot(model.blocks.map(blockToComponent)) as ComposerData['content'],
    zones: {},
  };
}

// ─── Puck → model ─────────────────────────────────────────────────────────────

type Any = Record<string, unknown>;
const list = (v: unknown): Component[] => (Array.isArray(v) ? (v as Component[]) : []);
const rich = (p: Any): RichText => {
  const out: RichText = { spans: toSpans(Array.isArray(p.spans) ? (p.spans as Any[]).map((s) => ({ text: str(s.text), bold: !!s.bold, italic: !!s.italic, underline: !!s.underline, link: str(s.link), color: str(s.color) })) : []) };
  if (out.spans.length === 0) out.spans.push({ text: '' });
  if (p.align && p.align !== 'left') out.align = p.align as RichText['align'];
  return out;
};

export function componentToBlock(c: Component): Block {
  const p = c.props as Any;
  const id = c.props.id ?? newId(c.type);
  switch (c.type) {
    case 'Heading': {
      const b: Block = { id, type: 'heading', level: (num(p.level) ?? 2) as 1 | 2 | 3 | 4 | 5 | 6, text: str(p.text) };
      if (p.align && p.align !== 'left') b.align = p.align as 'center' | 'right';
      if (p.keepWithNext) b.keepWithNext = true;
      return b;
    }
    case 'Text':
      return { id, type: 'text', rich: rich(p) };
    case 'Divider':
      return { id, type: 'divider', variant: (p.variant as 'solid' | 'dashed') ?? 'solid' };
    case 'Image': {
      const b: Block = { id, type: 'image', assetHash: str(p.assetHash) };
      if (num(p.width)) b.width = num(p.width);
      if (num(p.height)) b.height = num(p.height);
      if (p.fit && p.fit !== 'contain') b.fit = p.fit as 'cover';
      if (p.align && p.align !== 'left') b.align = p.align as 'center' | 'right';
      if (str(p.caption)) b.caption = str(p.caption);
      return b;
    }
    case 'QRCode': {
      const b: Block = { id, type: 'qrcode', value: str(p.value) };
      if (num(p.size)) b.size = num(p.size);
      if (p.align && p.align !== 'left') b.align = p.align as 'center' | 'right';
      return b;
    }
    case 'KeyValue':
      return { id, type: 'keyValue', items: (Array.isArray(p.items) ? (p.items as Any[]) : []).map((i) => ({ key: str(i.key), value: str(i.value) })) };
    case 'List':
      return { id, type: 'list', variant: (p.variant as 'bullet' | 'numbered') ?? 'bullet', items: (Array.isArray(p.items) ? (p.items as Any[]) : []).map((i) => rich(i)) };
    case 'Table': {
      const columns = (Array.isArray(p.columns) ? (p.columns as Any[]) : []).map((c, i) => {
        const col: { key: string; header: string; width?: number; align?: 'left' | 'center' | 'right' } = { key: str(c.key) || `c${i + 1}`, header: str(c.header) };
        if (num(c.width)) col.width = num(c.width);
        if (c.align && c.align !== 'left') col.align = c.align as 'center' | 'right';
        return col;
      });
      const rows = (Array.isArray(p.rows) ? (p.rows as Any[]) : []).map((r) => {
        const cells = (Array.isArray(r.cells) ? (r.cells as Any[]) : []).map((cell) => str(cell.value));
        while (cells.length < columns.length) cells.push('');
        return cells.slice(0, columns.length);
      });
      const b: Block = { id, type: 'table', columns, rows };
      if (p.variant && p.variant !== 'line') b.variant = p.variant as 'grid';
      return b;
    }
    case 'DataTable': {
      const columns = (Array.isArray(p.columns) ? (p.columns as Any[]) : []).map((c, i) => {
        const col: { key: string; header: string; cell: string; width?: number; align?: 'left' | 'center' | 'right' } = { key: str(c.key) || `c${i + 1}`, header: str(c.header), cell: str(c.cell) };
        if (num(c.width)) col.width = num(c.width);
        if (c.align && c.align !== 'left') col.align = c.align as 'center' | 'right';
        return col;
      });
      const b: Block = { id, type: 'dataTable', rowBinding: str(p.rowBinding), columns };
      if (p.variant && p.variant !== 'line') b.variant = p.variant as 'grid';
      if (str(p.emptyText)) b.emptyText = str(p.emptyText);
      return b;
    }
    case 'Section': {
      const b: Block = { id, type: 'section', blocks: list(p.content).map(componentToBlock) };
      if (str(p.title)) b.title = str(p.title);
      return b;
    }
    case 'Columns': {
      const b: Block = { id, type: 'columns', columns: (Array.isArray(p.columns) ? (p.columns as Any[]) : []).map((c) => ({ ...(num(c.width) ? { width: num(c.width) } : {}), blocks: list(c.content).map(componentToBlock) })) };
      if (num(p.gap)) b.gap = num(p.gap);
      if (p.align && p.align !== 'top') b.align = p.align as 'middle' | 'bottom';
      return b;
    }
    case 'Repeat':
      return { id, type: 'repeat', forEach: str(p.forEach), as: str(p.as) || 'item', blocks: list(p.content).map(componentToBlock) };
    case 'If': {
      const b: Block = { id, type: 'if', test: { var: str(p.test) }, then: list(p.whenTrue).map(componentToBlock) };
      const otherwise = list(p.whenFalse).map(componentToBlock);
      if (otherwise.length) b.else = otherwise;
      return b;
    }
    case 'KeepTogether':
      return { id, type: 'keepTogether', blocks: list(p.content).map(componentToBlock) };
    case 'PageBreak':
      return { id, type: 'pageBreak' };
    case 'Signature': {
      const b: Block = { id, type: 'signature', signer: {} };
      if (str(p.name)) b.signer.name = str(p.name);
      if (str(p.title)) b.signer.title = str(p.title);
      if (str(p.date)) b.signer.date = str(p.date);
      if (str(p.assetHash)) b.assetHash = str(p.assetHash);
      if (p.variant && p.variant !== 'single') b.variant = p.variant as 'inline';
      return b;
    }
    case 'Watermark': {
      const b: Block = { id, type: 'watermark', text: str(p.text) };
      if (num(p.opacity) !== undefined) b.opacity = num(p.opacity);
      return b;
    }
    case 'PageNumber':
      return { id, type: 'pageNumber', format: str(p.format) || 'Page {page} of {total}', align: (p.align as 'left' | 'center' | 'right') ?? 'center' };
    default:
      throw new Error(`Unknown component ${c.type}`);
  }
}

export function dataToModel(data: ComposerData, assets: { hash: string; mime: 'image/png' | 'image/jpeg' | 'image/svg+xml' }[], id = 'template'): DocumentModel {
  const r = (data.root.props ?? {}) as Partial<RootProps>;
  const model: DocumentModel = {
    version: 1,
    id,
    name: r.name || 'Untitled',
    locale: r.locale || 'en-GB',
    theme: r.theme || 'professional',
    page: { size: r.pageSize ?? 'A4', orientation: r.orientation ?? 'portrait', margins: { top: r.marginTop ?? 56, right: r.marginRight ?? 48, bottom: r.marginBottom ?? 56, left: r.marginLeft ?? 48 } },
    assets,
    blocks: (data.content as Component[]).map(componentToBlock),
  };
  const header = list(r.header).map(componentToBlock);
  const footer = list(r.footer).map(componentToBlock);
  if (header.length) model.header = header;
  if (footer.length) model.footer = footer;
  return model;
}


