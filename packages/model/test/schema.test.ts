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
        { id: 'b', type: 'signature', assetHash: 'gone', signer: {} },
      ],
    };
    const result = validateModel(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.message)).toEqual([
      'No asset "nope"',
      'Duplicate block id "a"',
      'No asset "gone"',
    ]);
  });

  it('rejects an unknown filter inside an inline binding with its path', () => {
    const result = validateModel({ ...invoiceModel, blocks: [{ id: 'x', type: 'heading', level: 1, text: '{{ name | trim }}' }] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.path === 'blocks.0.text' && /Unknown filter "trim"/.test(i.message))).toBe(true);
  });

  it('rejects table column widths that exceed the table', () => {
    const result = validateModel({ ...invoiceModel, blocks: [{ id: 'x', type: 'table', columns: [{ key: 'a', header: 'A', width: 0.6 }, { key: 'b', header: 'B', width: 0.6 }], rows: [] }] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.message)).toContain('Column widths add up to more than 1');
  });

  it('walks columns for ids and assets, and rejects column widths over 1', () => {
    const result = validateModel({ ...invoiceModel, blocks: [
      { id: 'c', type: 'columns', columns: [{ width: 0.7, blocks: [{ id: 'img', type: 'image', assetHash: 'missing' }] }, { width: 0.7, blocks: [] }] },
    ] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.message)).toContain('Column widths add up to more than 1');
    const ok = validateModel({ ...invoiceModel, blocks: [
      { id: 'c', type: 'columns', columns: [{ blocks: [{ id: 'img', type: 'image', assetHash: 'missing' }] }, { blocks: [] }] },
    ] });
    expect(ok.ok).toBe(false);
    if (ok.ok) return;
    expect(ok.issues).toEqual([{ path: 'blocks.0.columns.0.blocks.0.assetHash', message: 'No asset "missing"' }]);
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
