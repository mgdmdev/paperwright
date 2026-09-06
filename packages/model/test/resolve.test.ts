import { describe, expect, it } from 'vitest';
import { listBindings, resolveDocument } from '../src/resolve';
import { invoiceData, invoiceModel } from './fixtures';

describe('resolveDocument', () => {
  const doc = resolveDocument({ model: invoiceModel, data: invoiceData });

  it('resolves headings, header and footer', () => {
    expect(doc.blocks[0]).toMatchObject({ type: 'heading', text: 'Invoice INV-042' });
    expect(doc.header?.[0]).toMatchObject({ type: 'heading', text: 'ACME LTD' });
    expect(doc.footer?.[0]).toMatchObject({ type: 'pageNumber' });
  });

  it('applies filters from both binding forms', () => {
    expect(doc.blocks[1]).toMatchObject({
      type: 'keyValue',
      items: [
        { key: 'Issued', value: '1 September 2026' },
        { key: 'Due', value: '30 September 2026' },
        { key: 'PO', value: 'none' },
      ],
    });
  });

  it('turns a dataTable into a table with row-relative cells', () => {
    const table = doc.blocks[2];
    expect(table?.type).toBe('table');
    if (table?.type !== 'table') return;
    expect(table.columns.map((c) => c.header)).toEqual(['#', 'Description', 'Qty', 'Amount']);
    expect(table.rows[0]).toEqual(['1', 'Consulting', '10', expect.stringMatching(/1,500\.00/)]);
    expect(table.rows[1]?.[3]).toMatch(/240\.50/);
  });

  it('takes the else branch of an if on an empty string', () => {
    expect(doc.blocks[3]).toMatchObject({ type: 'text', rich: { spans: [{ text: 'No notes' }] } });
  });

  it('expands a repeat with unique ids and the loop variable', () => {
    expect(doc.blocks[4]).toMatchObject({ id: 'payee:0', rich: { spans: [{ text: '1. Kofi (60.0%)' }] } });
    expect(doc.blocks[5]).toMatchObject({ id: 'payee:1', rich: { spans: [{ text: '2. Efua (40.0%)' }] } });
  });

  it('resolves signer fields', () => {
    expect(doc.blocks[6]).toMatchObject({ type: 'signature', signer: { name: 'Ama Mensah', title: 'Customer' } });
  });

  it('renders emptyText for an empty dataTable and warns on missing values', () => {
    const empty = resolveDocument({
      model: invoiceModel,
      data: { ...invoiceData, invoice: { ...invoiceData.invoice, lines: [], number: undefined } },
    });
    expect(empty.blocks[2]).toMatchObject({ type: 'text', rich: { spans: [{ text: 'No lines' }] } });
    expect(empty.warnings).toContain('No value for "invoice.number"');
  });

  it('warns when a repeat or dataTable path is missing instead of silently rendering nothing', () => {
    const typo = resolveDocument({
      model: { ...invoiceModel, blocks: [{ id: 'r', type: 'repeat', forEach: 'invoice.lnies', as: 'l', blocks: [] }, { id: 't', type: 'dataTable', rowBinding: 'nope', columns: [{ key: 'a', header: 'A', cell: '{{ a }}' }] }] },
      data: invoiceData,
    });
    expect(typo.warnings).toEqual(['No value for "invoice.lnies"', 'No value for "nope"']);
  });

  it('resolves blocks inside columns and keeps repeat suffixes on them', () => {
    const doc = resolveDocument({
      model: {
        ...invoiceModel,
        blocks: [
          { id: 'r', type: 'repeat', forEach: 'invoice.payees', as: 'p', blocks: [
            { id: 'cols', type: 'columns', columns: [
              { width: 0.5, blocks: [{ id: 'name', type: 'text', rich: { spans: [{ text: '{{ p.name }}' }] } }] },
              { blocks: [{ id: 'share', type: 'heading', level: 4, align: 'right', text: '{{ p.share | number:0 }}%' }] },
            ] },
            { id: 'pb', type: 'pageBreak' },
          ] },
        ],
      },
      data: invoiceData,
    });
    expect(doc.blocks.map((b) => b.id)).toEqual(['cols:0', 'pb:0', 'cols:1', 'pb:1']);
    expect(doc.blocks[0]).toMatchObject({
      type: 'columns',
      columns: [
        { width: 0.5, blocks: [{ id: 'name:0', rich: { spans: [{ text: 'Kofi' }] } }] },
        { blocks: [{ id: 'share:0', text: '60%', align: 'right' }] },
      ],
    });
    expect(doc.warnings).toEqual([]);
  });

  it('warns and degrades instead of throwing when a filter or locale fails at render', () => {
    const doc = resolveDocument({
      model: { ...invoiceModel, locale: 'en US', blocks: [
        { id: 'a', type: 'text', rich: { spans: [{ text: { var: 'invoice.subtotal', filters: [{ name: 'currency', args: { code: 'GH' } }] } }] } },
      ] },
      data: { company: { name: 'Acme' }, invoice: { subtotal: 5 } },
      locale: 'nope!',
    });
    expect(doc.warnings).toEqual([
      'Locale "nope!" is not valid; using the template\'s',
      'Locale "en US" is not valid; using en',
      expect.stringMatching(/^Filter failed for "invoice.subtotal": /),
    ]);
    expect(doc.blocks[0]).toMatchObject({ rich: { spans: [{ text: '5' }] } });
  });

  it('honours a render-time locale override', () => {
    const fr = resolveDocument({ model: invoiceModel, data: invoiceData, locale: 'fr-FR' });
    const meta = fr.blocks[1];
    if (meta?.type !== 'keyValue') throw new Error('expected keyValue');
    expect(meta.items[0]?.value).toBe('1 septembre 2026');
  });
});

describe('listBindings', () => {
  it('collects every path the model reads', () => {
    expect(listBindings(invoiceModel)).toEqual([
      '$number',
      'amount',
      'company.name',
      'customer.name',
      'description',
      'invoice.dueOn',
      'invoice.issuedOn',
      'invoice.lines',
      'invoice.notes',
      'invoice.number',
      'invoice.payees',
      'invoice.po',
      'p.name',
      'p.share',
      'quantity',
    ]);
  });
});
