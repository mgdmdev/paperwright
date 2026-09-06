import { applyFilters, toText } from './filters';
import { getPath, parsePath, parseTemplate } from './bindings';
import type {
  Binding,
  BindingOrString,
  Block,
  DataTableBlock,
  DocumentModel,
  RenderData,
  RenderInput,
  ResolvedBlock,
  ResolvedDocument,
  RichText,
  TableBlock,
} from './types';

interface Scope {
  vars: Record<string, unknown>;
}

interface Ctx {
  root: RenderData;
  scopes: Scope[];
  locale: string;
  warnings: string[];
}

/**
 * Turns a model plus data into what a renderer draws: every binding a string, every repeat and
 * conditional expanded, every dataTable a table. Missing data yields empty text and a warning,
 * never a throw, because a half-rendered document is more useful than none when a host is
 * debugging its data.
 */
export function resolveDocument(input: RenderInput): ResolvedDocument & { warnings: string[] } {
  const ctx: Ctx = {
    root: input.data,
    scopes: [],
    locale: input.locale ?? input.model.locale,
    warnings: [],
  };
  const header = input.model.header ? resolveBlocks(input.model.header, ctx) : undefined;
  const footer = input.model.footer ? resolveBlocks(input.model.footer, ctx) : undefined;
  const blocks = resolveBlocks(input.model.blocks, ctx);
  const doc: ResolvedDocument & { warnings: string[] } = {
    model: input.model,
    blocks,
    locale: ctx.locale,
    warnings: ctx.warnings,
  };
  if (header) doc.header = header;
  if (footer) doc.footer = footer;
  return doc;
}

export function lookup(ctx: Ctx, path: string): unknown {
  const segments = parsePath(path);
  const [head, ...rest] = segments;
  if (head === undefined) return undefined;
  if (head === '$root') return getPath(ctx.root, rest);
  for (let i = ctx.scopes.length - 1; i >= 0; i--) {
    const scope = ctx.scopes[i];
    if (scope && Object.prototype.hasOwnProperty.call(scope.vars, head)) {
      return getPath(scope.vars[head], rest);
    }
  }
  return getPath(ctx.root, segments);
}

function evaluate(ctx: Ctx, binding: Binding): unknown {
  const value = lookup(ctx, binding.var);
  if (value === undefined && !(binding.filters ?? []).some((f) => f.name === 'default')) {
    ctx.warnings.push(`No value for "${binding.var}"`);
  }
  return applyFilters(value, binding.filters, { locale: ctx.locale });
}

export function resolveText(ctx: Ctx, value: BindingOrString | undefined): string {
  if (value === undefined) return '';
  if (typeof value !== 'string') return toText(evaluate(ctx, value));
  if (!value.includes('{{')) return value;
  return parseTemplate(value)
    .map((part) => (part.kind === 'text' ? part.text : toText(evaluate(ctx, part.binding))))
    .join('');
}

function resolveRich(ctx: Ctx, rich: RichText): RichText {
  const out: RichText = {
    spans: rich.spans.map((span) => {
      const next = { ...span, text: resolveText(ctx, span.text) };
      if (span.link !== undefined) next.link = resolveText(ctx, span.link);
      return next;
    }),
  };
  if (rich.align) out.align = rich.align;
  return out;
}

function asArray(ctx: Ctx, path: string, blockId: string): unknown[] {
  const value = lookup(ctx, path);
  if (Array.isArray(value)) return value;
  if (value === undefined) ctx.warnings.push(`No value for "${path}"`);
  else if (value !== null) ctx.warnings.push(`Block "${blockId}": "${path}" is not an array`);
  return [];
}

function withScope<T>(ctx: Ctx, vars: Record<string, unknown>, fn: () => T): T {
  ctx.scopes.push({ vars });
  try {
    return fn();
  } finally {
    ctx.scopes.pop();
  }
}

function resolveDataTable(ctx: Ctx, block: DataTableBlock): ResolvedBlock {
  const rows = asArray(ctx, block.rowBinding, block.id);
  if (rows.length === 0 && block.emptyText !== undefined) {
    return { id: block.id, type: 'text', rich: { spans: [{ text: resolveText(ctx, block.emptyText) }] } };
  }
  const table: TableBlock = {
    id: block.id,
    type: 'table',
    columns: block.columns.map(({ cell: _cell, ...column }) => ({ ...column, header: resolveText(ctx, column.header) })),
    rows: rows.map((row, index) =>
      withScope(ctx, rowScope(row, index), () => block.columns.map((column) => resolveText(ctx, column.cell))),
    ),
  };
  if (block.variant) table.variant = block.variant;
  return table;
}

function rowScope(row: unknown, index: number): Record<string, unknown> {
  const vars: Record<string, unknown> =
    row !== null && typeof row === 'object' && !Array.isArray(row) ? { ...(row as Record<string, unknown>) } : {};
  vars.$item = row;
  vars.$index = index;
  vars.$number = index + 1;
  return vars;
}

export function resolveBlocks(blocks: Block[], ctx: Ctx): ResolvedBlock[] {
  const out: ResolvedBlock[] = [];
  for (const block of blocks) out.push(...resolveBlock(block, ctx));
  return out;
}

function resolveBlock(block: Block, ctx: Ctx): ResolvedBlock[] {
  switch (block.type) {
    case 'heading':
      return [{ ...block, text: resolveText(ctx, block.text) }];
    case 'text':
      return [{ ...block, rich: resolveRich(ctx, block.rich) }];
    case 'divider':
    case 'pageBreak':
    case 'pageNumber':
      return [block];
    case 'columns':
      return [{ ...block, columns: block.columns.map((c) => ({ ...c, blocks: resolveBlocks(c.blocks, ctx) })) }];
    case 'image': {
      const next = { ...block };
      if (block.caption !== undefined) next.caption = resolveText(ctx, block.caption);
      return [next];
    }
    case 'qrcode':
      return [{ ...block, value: resolveText(ctx, block.value) }];
    case 'keyValue':
      return [
        {
          ...block,
          items: block.items.map((item) => ({ key: resolveText(ctx, item.key), value: resolveText(ctx, item.value) })),
        },
      ];
    case 'list':
      return [{ ...block, items: block.items.map((item) => resolveRich(ctx, item)) }];
    case 'table':
      return [
        {
          ...block,
          columns: block.columns.map((column) => ({ ...column, header: resolveText(ctx, column.header) })),
          rows: block.rows.map((row) => row.map((cell) => resolveText(ctx, cell))),
        },
      ];
    case 'dataTable':
      return [resolveDataTable(ctx, block)];
    case 'section': {
      const next = { ...block, blocks: resolveBlocks(block.blocks, ctx) };
      if (block.title !== undefined) next.title = resolveText(ctx, block.title);
      return [next];
    }
    case 'keepTogether':
      return [{ ...block, blocks: resolveBlocks(block.blocks, ctx) }];
    case 'repeat': {
      const items = asArray(ctx, block.forEach, block.id);
      return items.flatMap((item, index) =>
        withScope(ctx, { [block.as]: item, $index: index, $number: index + 1 }, () =>
          resolveBlocks(block.blocks, ctx).map((b) => suffixId(b, index)),
        ),
      );
    }
    case 'if': {
      const test = evaluate(ctx, block.test);
      const branch = isTruthy(test) ? block.then : (block.else ?? []);
      return resolveBlocks(branch, ctx);
    }
    case 'signature': {
      const signer: typeof block.signer = {};
      if (block.signer.name !== undefined) signer.name = resolveText(ctx, block.signer.name);
      if (block.signer.title !== undefined) signer.title = resolveText(ctx, block.signer.title);
      if (block.signer.date !== undefined) signer.date = resolveText(ctx, block.signer.date);
      return [{ ...block, signer }];
    }
    case 'watermark':
      return [{ ...block, text: resolveText(ctx, block.text) }];
  }
}

function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0 && value.trim().toLowerCase() !== 'false';
  return Boolean(value);
}

/** Ids stay unique across repeat iterations; nested blocks get the same suffix so a builder can trace them back. */
function suffixId<T extends ResolvedBlock>(block: T, index: number): T {
  const id = `${block.id}:${index}`;
  // Children of a resolved container are resolved too; the shared type cannot say so.
  if (block.type === 'section' || block.type === 'keepTogether') {
    return { ...block, id, blocks: (block.blocks as ResolvedBlock[]).map((b) => suffixId(b, index)) };
  }
  if (block.type === 'columns') {
    return { ...block, id, columns: block.columns.map((c) => ({ ...c, blocks: (c.blocks as ResolvedBlock[]).map((b) => suffixId(b, index)) })) };
  }
  return { ...block, id };
}

/** Every path a model reads, for a builder's variable picker and for checking data before a render. */
export function listBindings(model: DocumentModel): string[] {
  const found = new Set<string>();
  const visitText = (value: BindingOrString | undefined) => {
    if (value === undefined) return;
    if (typeof value !== 'string') {
      found.add(value.var);
      return;
    }
    for (const part of parseTemplate(value)) if (part.kind === 'binding') found.add(part.binding.var);
  };
  const visitRich = (rich: RichText) => rich.spans.forEach((s) => (visitText(s.text), visitText(s.link)));
  const visit = (blocks: Block[]) => {
    for (const block of blocks) {
      switch (block.type) {
        case 'heading':
        case 'watermark':
          visitText(block.text);
          break;
        case 'text':
          visitRich(block.rich);
          break;
        case 'image':
          visitText(block.caption);
          break;
        case 'qrcode':
          visitText(block.value);
          break;
        case 'keyValue':
          block.items.forEach((i) => (visitText(i.key), visitText(i.value)));
          break;
        case 'list':
          block.items.forEach(visitRich);
          break;
        case 'table':
          block.columns.forEach((c) => visitText(c.header));
          block.rows.forEach((r) => r.forEach(visitText));
          break;
        case 'dataTable':
          found.add(block.rowBinding);
          block.columns.forEach((c) => (visitText(c.header), visitText(c.cell)));
          visitText(block.emptyText);
          break;
        case 'section':
          visitText(block.title);
          visit(block.blocks);
          break;
        case 'keepTogether':
          visit(block.blocks);
          break;
        case 'columns':
          block.columns.forEach((c) => visit(c.blocks));
          break;
        case 'repeat':
          found.add(block.forEach);
          visit(block.blocks);
          break;
        case 'if':
          found.add(block.test.var);
          visit(block.then);
          if (block.else) visit(block.else);
          break;
        case 'signature':
          visitText(block.signer.name);
          visitText(block.signer.title);
          visitText(block.signer.date);
          break;
        case 'divider':
        case 'pageBreak':
        case 'pageNumber':
          break;
      }
    }
  };
  visit(model.blocks);
  if (model.header) visit(model.header);
  if (model.footer) visit(model.footer);
  return [...found].sort();
}
