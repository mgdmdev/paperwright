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
    expect(result.issues.map((i) => i.message)).toContain('Column widths add up to the whole row or more');
  });

  it('walks columns for ids and assets, and rejects column widths over 1', () => {
    const result = validateModel({ ...invoiceModel, blocks: [
      { id: 'c', type: 'columns', columns: [{ width: 0.7, blocks: [{ id: 'img', type: 'image', assetHash: 'missing' }] }, { width: 0.7, blocks: [] }] },
    ] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.message)).toContain('Column widths add up to the whole row or more');
    const ok = validateModel({ ...invoiceModel, blocks: [
      { id: 'c', type: 'columns', columns: [{ blocks: [{ id: 'img', type: 'image', assetHash: 'missing' }] }, { blocks: [] }] },
    ] });
    expect(ok.ok).toBe(false);
    if (ok.ok) return;
    expect(ok.issues).toEqual([{ path: 'blocks.0.columns.0.blocks.0.assetHash', message: 'No asset "missing"' }]);
  });

  it('rejects filter arguments and locales that Intl would throw on, in both binding forms', () => {
    const inline = validateModel({ ...invoiceModel, blocks: [{ id: 'x', type: 'heading', level: 1, text: '{{ n | currency:GH }}' }] });
    expect(inline.ok).toBe(false);
    if (inline.ok) return;
    expect(inline.issues[0]).toMatchObject({ path: 'blocks.0.text', message: expect.stringMatching(/three letters/) });
    const object = validateModel({ ...invoiceModel, blocks: [{ id: 'x', type: 'heading', level: 1, text: { var: 'n', filters: [{ name: 'number', args: { min: '-1' } }] } }] });
    expect(object.ok).toBe(false);
    const locale = validateModel({ ...invoiceModel, locale: 'en US' });
    expect(locale.ok).toBe(false);
    if (locale.ok) return;
    expect(locale.issues[0]).toMatchObject({ path: 'locale', message: 'Not a valid BCP 47 locale' });
  });

  it('rejects a pageBreak where it cannot break: bands, columns, keepTogether', () => {
    const result = validateModel({
      ...invoiceModel,
      header: [{ id: 'h1', type: 'pageBreak' }],
      blocks: [
        { id: 'ok', type: 'pageBreak' },
        { id: 'k', type: 'keepTogether', blocks: [{ id: 'k1', type: 'pageBreak' }] },
        { id: 'c', type: 'columns', columns: [{ blocks: [{ id: 'c1', type: 'pageBreak' }] }] },
        { id: 's', type: 'section', blocks: [{ id: 's1', type: 'pageBreak' }] },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.path)).toEqual(['blocks.1.blocks.0', 'blocks.2.columns.0.blocks.0', 'header.0']);
  });

  it('rejects table rows that do not match the column count and widths that fill the row with open columns left', () => {
    const rows = validateModel({ ...invoiceModel, blocks: [{ id: 't', type: 'table', columns: [{ key: 'a', header: 'A' }, { key: 'b', header: 'B' }], rows: [['1'], ['1', '2', '3']] }] });
    expect(rows.ok).toBe(false);
    if (rows.ok) return;
    expect(rows.issues.map((i) => i.message)).toContain('Each row must have one cell per column');
    const widths = validateModel({ ...invoiceModel, blocks: [{ id: 'c', type: 'columns', columns: [{ width: 0.5, blocks: [] }, { width: 0.5, blocks: [] }, { blocks: [] }] }] });
    expect(widths.ok).toBe(false);
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
