import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { migrateModel, resolveDocument, validateModel } from '@paperwright/model';
import { dataToModel, modelToData } from '../src/transform';

const examples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../examples/basic');
const names = ['invoice', 'letter', 'payslip', 'certificate'];

describe('model ↔ Puck data', () => {
  // The transform writes canonical values (defaults omitted), so equality is checked on what the
  // templates resolve to with their data, and on the second pass being a fixed point.
  it.each(names)('round-trips the %s template without visible loss, and is idempotent', async (name) => {
    const model = migrateModel(JSON.parse(await readFile(path.join(examples, `templates/${name}.json`), 'utf8')));
    const data = JSON.parse(await readFile(path.join(examples, `data/${name}.json`), 'utf8'));
    const once = dataToModel(modelToData(model, data), model.assets, model.id);
    expect(validateModel(once).ok).toBe(true);
    const visible = (m: typeof model) => {
      const { blocks, header, footer, warnings } = resolveDocument({ model: m, data });
      return { blocks, header, footer, warnings };
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
