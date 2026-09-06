import { describe, expect, it } from 'vitest';
import { migrateModel, ModelError } from '../src/migrations';
import { validateModel } from '../src/schema';
import { invoiceModel } from './fixtures';

describe('validateModel', () => {
  it('accepts the fixture', () => {
    expect(validateModel(invoiceModel)).toEqual({ ok: true, model: invoiceModel });
  });

  it('reports duplicate ids and missing assets', () => {
    const bad = {
      ...invoiceModel,
      blocks: [
        { id: 'a', type: 'image', assetHash: 'nope' },
        { id: 'a', type: 'divider' },
        { id: 'b', type: 'signature', mode: 'slot', signer: {} },
      ],
    };
    const result = validateModel(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.message)).toEqual([
      'No asset "nope"',
      'Duplicate block id "a"',
      'A signature slot needs a slotId',
    ]);
  });

  it('rejects an unknown block type at the schema level', () => {
    const result = validateModel({ ...invoiceModel, blocks: [{ id: 'x', type: 'video' }] });
    expect(result.ok).toBe(false);
  });
});

describe('migrateModel', () => {
  it('returns a current-version template unchanged', () => {
    expect(migrateModel(JSON.parse(JSON.stringify(invoiceModel)))).toEqual(invoiceModel);
  });

  it('refuses newer or unversioned input', () => {
    expect(() => migrateModel({ ...invoiceModel, version: 2 })).toThrow(ModelError);
    expect(() => migrateModel({})).toThrow(/numeric "version"/);
  });
});
