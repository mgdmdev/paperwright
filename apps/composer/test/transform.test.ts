import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { migrateModel, resolveDocument, validateModel } from '@paperwright/model';
import { dataToModel, modelToData } from '../src/transform';

const examples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../examples/basic');
const names = ['invoice', 'letter', 'payslip', 'certificate'];

// The transform writes canonical templates: an optional field equal to its default is omitted.
// These are the defaults it omits; the expected side is stripped the same way before comparing.
const DEFAULTS: Record<string, Record<string, unknown>> = {
  heading: { align: 'left' },
  image: { align: 'left', fit: 'contain' },
  qrcode: { align: 'left' },
  table: { variant: 'line' },
  dataTable: { variant: 'line' },
  signature: { variant: 'single' },
  columns: { align: 'top' },
  divider: { variant: 'solid' },
};

const stripDefaults = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripDefaults);
  if (!value || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  const defaults = typeof obj.type === 'string' ? DEFAULTS[obj.type] ?? {} : {};
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([k, v]) => !(k in defaults && defaults[k] === v))
      .map(([k, v]) => [k, stripDefaults(v)]),
  );
};

describe('model ↔ Puck data', () => {
  // Equality is checked on what the templates resolve to with their data (after default
  // stripping), and on the second pass being a fixed point.
  it.each(names)('round-trips the %s template without visible loss, and is idempotent', async (name) => {
    const model = migrateModel(JSON.parse(await readFile(path.join(examples, `templates/${name}.json`), 'utf8')));
    const data = JSON.parse(await readFile(path.join(examples, `data/${name}.json`), 'utf8'));
    const once = dataToModel(modelToData(model, data), model.assets, model.id);
    expect(validateModel(once).ok).toBe(true);
    const visible = (m: typeof model) => {
      const { blocks, header, footer, warnings } = resolveDocument({ model: m, data });
      return stripDefaults({ blocks, header, footer, warnings });
    };
    expect(visible(once)).toEqual(visible(model));
    const twice = dataToModel(modelToData(once, data), model.assets, model.id);
    expect(twice).toEqual(once);
  });

  it('gives a component placed without an id one, and keeps a template valid', () => {
    const data = modelToData(migrateModel({ version: 1, id: 't', name: 'T', locale: 'en', page: { size: 'A4', orientation: 'portrait', margins: { top: 40, right: 40, bottom: 40, left: 40 } }, assets: [], blocks: [] }), {});
    data.content = [{ type: 'Heading', props: { level: 2, text: 'New', align: 'left', keepWithNext: false } } as never];
    const model = dataToModel(data, []);
    expect(model.blocks[0]).toMatchObject({ type: 'heading', level: 2, text: 'New' });
    expect(model.blocks[0]?.id).toMatch(/^Heading-/);
    expect(validateModel(model).ok).toBe(true);
  });
});
