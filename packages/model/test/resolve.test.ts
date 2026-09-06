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
