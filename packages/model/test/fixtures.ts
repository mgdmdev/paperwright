import type { DocumentModel } from '../src/types';

export const invoiceModel: DocumentModel = {
  version: 1,
  id: 'invoice',
  name: 'Invoice',
  locale: 'en-GB',
  page: { size: 'A4', orientation: 'portrait', margins: { top: 56, right: 48, bottom: 56, left: 48 } },
  header: [{ id: 'h', type: 'heading', level: 3, text: '{{ company.name | upper }}' }],
  footer: [{ id: 'pn', type: 'pageNumber', format: 'Page {page} of {total}', align: 'center' }],
  blocks: [
    { id: 'title', type: 'heading', level: 1, text: 'Invoice {{ invoice.number }}' },
    {
      id: 'meta',
      type: 'keyValue',
      items: [
        { key: 'Issued', value: { var: 'invoice.issuedOn', filters: [{ name: 'date', args: { style: 'long' } }] } },
        { key: 'Due', value: '{{ invoice.dueOn | date:long }}' },
        { key: 'PO', value: '{{ invoice.po | default:"none" }}' },
      ],
    },
    {
      id: 'lines',
      type: 'dataTable',
      rowBinding: 'invoice.lines',
      columns: [
        { key: 'n', header: '#', cell: '{{ $number }}', width: 0.08 },
        { key: 'desc', header: 'Description', cell: '{{ description }}' },
        { key: 'qty', header: 'Qty', cell: '{{ quantity | number:0 }}', align: 'right', width: 0.12 },
        { key: 'amount', header: 'Amount', cell: '{{ amount | currency:GHS }}', align: 'right', width: 0.2 },
      ],
      emptyText: 'No lines',
    },
    {
      id: 'notes',
      type: 'if',
      test: { var: 'invoice.notes' },
      then: [{ id: 'notes-text', type: 'text', rich: { spans: [{ text: '{{ invoice.notes }}' }] } }],
      else: [{ id: 'notes-none', type: 'text', rich: { spans: [{ text: 'No notes' }] } }],
    },
    {
      id: 'payees',
      type: 'repeat',
      forEach: 'invoice.payees',
      as: 'p',
      blocks: [
        { id: 'payee', type: 'text', rich: { spans: [{ text: '{{ $number }}. {{ p.name }} ({{ p.share | number:1 }}%)' }] } },
      ],
    },
    { id: 'sig', type: 'signature', mode: 'slot', slotId: 'customer', signer: { name: '{{ customer.name }}', title: 'Customer' } },
  ],
  assets: [],
};

export const invoiceData = {
  company: { name: 'Acme Ltd' },
  customer: { name: 'Ama Mensah' },
  invoice: {
    number: 'INV-042',
    issuedOn: '2026-09-01',
    dueOn: '2026-09-30',
    notes: '',
    lines: [
      { description: 'Consulting', quantity: 10, amount: 1500 },
      { description: 'Travel', quantity: 1, amount: 240.5 },
    ],
    payees: [
      { name: 'Kofi', share: 60 },
      { name: 'Efua', share: 40 },
    ],
  },
};
