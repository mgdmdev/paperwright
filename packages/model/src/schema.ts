import { z } from 'zod';
import { parseTemplate } from './bindings';
import type { Block, DocumentModel } from './types';

const bindingSchema = z.object({
  var: z.string().min(1),
  filters: z
    .array(
      z.object({
        name: z.enum(['date', 'number', 'currency', 'upper', 'lower', 'default', 'join']),
        args: z.record(z.string(), z.string()).optional(),
      }),
    )
    .optional(),
});

/** A literal string may carry inline bindings; they are parsed here so an unknown filter fails validation, not the render. */
const templateString = z.string().superRefine((value, ctx) => {
  if (!value.includes('{{')) return;
  try {
    parseTemplate(value);
  } catch (error) {
    ctx.addIssue({ code: 'custom', message: error instanceof Error ? error.message : String(error) });
  }
});

const bindingOrString = z.union([templateString, bindingSchema]);

/** Declared widths are fractions of the table; more than the whole table cannot be laid out. */
const widthsFit = (columns: { width?: number }[]) => columns.reduce((sum, c) => sum + (c.width ?? 0), 0) <= 1.0001;
const WIDTHS_MESSAGE = 'Column widths add up to more than 1';

const spanSchema = z.object({
  text: bindingOrString,
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  color: z.string().optional(),
  link: bindingOrString.optional(),
});

const richTextSchema = z.object({
  spans: z.array(spanSchema),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
});

const align = z.enum(['left', 'center', 'right']);
const tableVariant = z.enum(['line', 'grid', 'bordered', 'striped', 'compact', 'minimal']);

const tableColumn = z.object({
  key: z.string().min(1),
  header: bindingOrString,
  width: z.number().positive().max(1).optional(),
  align: align.optional(),
});

const base = { id: z.string().min(1) };

export const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ ...base, type: z.literal('heading'), level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]), text: bindingOrString, keepWithNext: z.boolean().optional() }),
    z.object({ ...base, type: z.literal('text'), rich: richTextSchema }),
    z.object({ ...base, type: z.literal('divider'), variant: z.enum(['solid', 'dashed']).optional() }),
    z.object({ ...base, type: z.literal('image'), assetHash: z.string().min(1), width: z.number().positive().optional(), height: z.number().positive().optional(), fit: z.enum(['contain', 'cover']).optional(), align: align.optional(), caption: bindingOrString.optional() }),
    z.object({ ...base, type: z.literal('qrcode'), value: bindingOrString, size: z.number().positive().optional(), align: align.optional() }),
    z.object({ ...base, type: z.literal('keyValue'), items: z.array(z.object({ key: bindingOrString, value: bindingOrString })) }),
    z.object({ ...base, type: z.literal('list'), variant: z.enum(['bullet', 'numbered']), items: z.array(richTextSchema) }),
    z.object({ ...base, type: z.literal('table'), columns: z.array(tableColumn).min(1).refine(widthsFit, WIDTHS_MESSAGE), rows: z.array(z.array(bindingOrString)), variant: tableVariant.optional() }),
    z.object({ ...base, type: z.literal('dataTable'), columns: z.array(tableColumn.extend({ cell: bindingOrString })).min(1).refine(widthsFit, WIDTHS_MESSAGE), rowBinding: z.string().min(1), variant: tableVariant.optional(), emptyText: bindingOrString.optional() }),
    z.object({ ...base, type: z.literal('section'), title: bindingOrString.optional(), blocks: z.array(blockSchema) }),
    z.object({ ...base, type: z.literal('repeat'), forEach: z.string().min(1), as: z.string().min(1), blocks: z.array(blockSchema) }),
    z.object({ ...base, type: z.literal('if'), test: bindingSchema, then: z.array(blockSchema), else: z.array(blockSchema).optional() }),
    z.object({ ...base, type: z.literal('pageBreak') }),
    z.object({ ...base, type: z.literal('keepTogether'), blocks: z.array(blockSchema) }),
    z.object({ ...base, type: z.literal('signature'), mode: z.enum(['captured', 'slot']), assetHash: z.string().optional(), slotId: z.string().optional(), signer: z.object({ name: bindingOrString.optional(), title: bindingOrString.optional(), date: bindingOrString.optional() }), variant: z.enum(['single', 'inline']).optional() }),
    z.object({ ...base, type: z.literal('watermark'), text: bindingOrString, opacity: z.number().min(0).max(1).optional() }),
    z.object({ ...base, type: z.literal('pageNumber'), format: z.string().optional(), align: align.optional() }),
  ]),
) as z.ZodType<Block>;

export const pageSetupSchema = z.object({
  size: z.union([z.enum(['A4', 'Letter', 'Legal']), z.object({ width: z.number().positive(), height: z.number().positive() })]),
  orientation: z.enum(['portrait', 'landscape']),
  margins: z.object({ top: z.number().min(0), right: z.number().min(0), bottom: z.number().min(0), left: z.number().min(0) }),
});

export const assetSchema = z.object({
  hash: z.string().min(1),
  mime: z.enum(['image/png', 'image/jpeg', 'image/svg+xml']),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

export const documentModelSchema: z.ZodType<DocumentModel> = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  locale: z.string().min(2),
  page: pageSetupSchema,
  theme: z.string().optional(),
  header: z.array(blockSchema).optional(),
  footer: z.array(blockSchema).optional(),
  blocks: z.array(blockSchema),
  assets: z.array(assetSchema),
  variablesSchema: z.record(z.string(), z.unknown()).optional(),
}) as z.ZodType<DocumentModel>;

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult = { ok: true; model: DocumentModel } | { ok: false; issues: ValidationIssue[] };

/**
 * Shape validation through the schema, then the rules the schema cannot say: unique block ids,
 * image and captured-signature assets that exist, slot signatures that carry a slot id.
 */
export function validateModel(input: unknown): ValidationResult {
  const parsed = documentModelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
  }
  const model = parsed.data;
  const issues: ValidationIssue[] = [];
  const assets = new Set(model.assets.map((a) => a.hash));
  const ids = new Set<string>();
  const walk = (blocks: Block[], path: string) => {
    blocks.forEach((block, i) => {
      const here = `${path}.${i}`;
      if (ids.has(block.id)) issues.push({ path: `${here}.id`, message: `Duplicate block id "${block.id}"` });
      ids.add(block.id);
      if (block.type === 'image' && !assets.has(block.assetHash)) {
        issues.push({ path: `${here}.assetHash`, message: `No asset "${block.assetHash}"` });
      }
      if (block.type === 'signature') {
        if (block.mode === 'captured' && (!block.assetHash || !assets.has(block.assetHash))) {
          issues.push({ path: `${here}.assetHash`, message: 'A captured signature needs an asset' });
        }
        if (block.mode === 'slot' && !block.slotId) {
          issues.push({ path: `${here}.slotId`, message: 'A signature slot needs a slotId' });
        }
      }
      if (block.type === 'section' || block.type === 'keepTogether' || block.type === 'repeat') walk(block.blocks, `${here}.blocks`);
      if (block.type === 'if') {
        walk(block.then, `${here}.then`);
        if (block.else) walk(block.else, `${here}.else`);
      }
    });
  };
  walk(model.blocks, 'blocks');
  if (model.header) walk(model.header, 'header');
  if (model.footer) walk(model.footer, 'footer');
  return issues.length ? { ok: false, issues } : { ok: true, model };
}
