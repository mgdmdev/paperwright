import type { Slot } from '@puckeditor/core';
import type { ReactNode } from 'react';
import { assetField } from './fields/AssetField';
import { bindingText, pathText } from './fields/BindingText';
import type { ComposerConfig } from './puck';

/** Theme tokens the canvas needs; the server sends the full presets. */
export interface CanvasTheme {
  colors: Record<string, string>;
  typography: { body: { fontFamily: string; fontSize: number; lineHeight: number }; heading: { fontFamily: string; fontSize: Record<string, number>; lineHeight: number } };
  spacing: { sectionGap: number; componentGap: number; paragraphGap: number };
  primitives: { typography: Record<string, number>; fontWeights: Record<string, number> };
}

export interface CanvasMetadata {
  themes: Record<string, CanvasTheme>;
  assets: string[];
}

type SpanProps = { text: string; bold: boolean; italic: boolean; underline: boolean; link: string; color: string };
type Align = 'left' | 'center' | 'right';

export type Components = {
  Heading: { level: number; text: string; align: Align; keepWithNext: boolean };
  Text: { spans: SpanProps[]; align: Align | 'justify' };
  Divider: { variant: 'solid' | 'dashed' };
  Image: { assetHash: string; width: number; height: number; fit: 'contain' | 'cover'; align: Align; caption: string };
  QRCode: { value: string; size: number; align: Align };
  KeyValue: { items: { key: string; value: string }[] };
  List: { variant: 'bullet' | 'numbered'; items: { spans: SpanProps[] }[] };
  Table: { variant: string; columns: { key: string; header: string; width: number; align: Align }[]; rows: { cells: { value: string }[] }[] };
  DataTable: { rowBinding: string; variant: string; emptyText: string; columns: { key: string; header: string; cell: string; width: number; align: Align }[] };
  Section: { title: string; content: Slot };
  Columns: { gap: number; align: 'top' | 'middle' | 'bottom'; columns: { width: number; content: Slot }[] };
  Repeat: { forEach: string; as: string; content: Slot };
  // Not `then`: a props object whose `then` is a function (a slot render) is a thenable, and Puck awaits props.
  If: { test: string; whenTrue: Slot; whenFalse: Slot };
  KeepTogether: { content: Slot };
  PageBreak: Record<string, never>;
  Signature: { variant: 'single' | 'inline'; assetHash: string; name: string; title: string; date: string };
  Watermark: { text: string; opacity: number };
  PageNumber: { format: string; align: Align };
};

/** Renders `{{ … }}` as a chip so a binding reads as a binding on the canvas. */
export function Bound({ text }: { text: string }) {
  const parts = String(text ?? '').split(/(\{\{[^}]*\}\})/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith('{{') ? <span key={i} className="pw-binding">{p.slice(2, -2).trim()}</span> : <span key={i}>{p}</span>))}
    </>
  );
}

const alignOptions = [
  { label: 'Left', value: 'left' },
  { label: 'Centre', value: 'center' },
  { label: 'Right', value: 'right' },
];
const tableVariants = ['line', 'grid', 'bordered', 'striped', 'compact', 'minimal'].map((v) => ({ label: v, value: v }));
const yesNo = [
  { label: 'No', value: false },
  { label: 'Yes', value: true },
];

const spanFields = {
  type: 'array',
  label: 'Runs',
  getItemSummary: (item: SpanProps) => (item.text ? item.text.slice(0, 40) : 'empty run'),
  defaultItemProps: { text: '', bold: false, italic: false, underline: false, link: '', color: '' },
  arrayFields: {
    text: bindingText('Text', true),
    bold: { type: 'radio', label: 'Bold', options: yesNo },
    italic: { type: 'radio', label: 'Italic', options: yesNo },
    underline: { type: 'radio', label: 'Underline', options: yesNo },
    link: bindingText('Link (URL)'),
    color: { type: 'text', label: 'Colour (CSS)' },
  },
} as const;

const Runs = ({ spans }: { spans: SpanProps[] }) => (
  <>
    {(spans ?? []).map((s, i) => (
      <span key={i} style={{ fontWeight: s.bold ? 700 : undefined, fontStyle: s.italic ? 'italic' : undefined, textDecoration: s.underline || s.link ? 'underline' : undefined, color: s.color || (s.link ? 'var(--pw-primary)' : undefined), whiteSpace: 'pre-line' }}>
        <Bound text={s.text} />
      </span>
    ))}
  </>
);

const Frame = ({ label, children, tone = 'muted' }: { label: string; children: ReactNode; tone?: 'muted' | 'logic' }) => (
  <div className={`pw-frame pw-frame-${tone}`}>
    <div className="pw-frame-label">{label}</div>
    {children}
  </div>
);

const columnStyle = (fraction: number) => ({ flexGrow: fraction || 1, flexBasis: 0, minWidth: 0 });

/** The editor configuration. Image pickers read the live asset store, so uploads appear at once. */
export function createConfig(): ComposerConfig {
  return {
  categories: {
    text: { title: 'Text', components: ['Heading', 'Text', 'List', 'KeyValue', 'Divider'] },
    data: { title: 'Data', components: ['DataTable', 'Table', 'Repeat', 'If'] },
    media: { title: 'Media', components: ['Image', 'QRCode', 'Signature', 'Watermark'] },
    layout: { title: 'Layout', components: ['Section', 'Columns', 'KeepTogether', 'PageBreak', 'PageNumber'] },
  },
  root: {
    fields: {
      name: { type: 'text', label: 'Template name' },
      locale: { type: 'text', label: 'Locale (BCP 47)' },
      theme: { type: 'select', label: 'Theme', options: [{ label: 'Professional', value: 'professional' }, { label: 'Minimal', value: 'minimal' }] },
      pageSize: { type: 'select', label: 'Page size', options: [{ label: 'A4', value: 'A4' }, { label: 'Letter', value: 'Letter' }, { label: 'Legal', value: 'Legal' }, { label: 'Custom', value: 'custom' }] },
      pageWidth: { type: 'number', label: 'Custom width (pt)', min: 0 },
      pageHeight: { type: 'number', label: 'Custom height (pt)', min: 0 },
      orientation: { type: 'radio', label: 'Orientation', options: [{ label: 'Portrait', value: 'portrait' }, { label: 'Landscape', value: 'landscape' }] },
      marginTop: { type: 'number', label: 'Margin top (pt)', min: 0 },
      marginRight: { type: 'number', label: 'Margin right (pt)', min: 0 },
      marginBottom: { type: 'number', label: 'Margin bottom (pt)', min: 0 },
      marginLeft: { type: 'number', label: 'Margin left (pt)', min: 0 },
      header: { type: 'slot', label: 'Header (every page)', disallow: ['PageBreak'] },
      footer: { type: 'slot', label: 'Footer (every page)', disallow: ['PageBreak'] },
      sampleData: { type: 'textarea', label: 'Sample data (JSON, for preview and the variable picker)' },
    },
    defaultProps: { name: 'Untitled', locale: 'en-GB', theme: 'professional', pageSize: 'A4', pageWidth: 0, pageHeight: 0, orientation: 'portrait', marginTop: 56, marginRight: 48, marginBottom: 56, marginLeft: 48, header: [], footer: [], sampleData: '{}', assets: [] },
    render: ({ children, header: Header, footer: Footer, theme, pageSize, pageWidth, pageHeight, orientation, marginTop, marginRight, marginBottom, marginLeft, puck }) => {
      const t = (puck.metadata as CanvasMetadata | undefined)?.themes?.[theme];
      const sizes: Record<string, [number, number]> = { A4: [595.28, 841.89], Letter: [612, 792], Legal: [612, 1008] };
      const [w, h] = pageSize === 'custom' && pageWidth && pageHeight ? [pageWidth, pageHeight] : (sizes[pageSize] ?? sizes.A4!);
      const width = orientation === 'landscape' ? h : w;
      const vars = t
        ? ({
            '--pw-font': t.typography.body.fontFamily === 'Helvetica' ? 'Inter, system-ui, sans-serif' : `${t.typography.body.fontFamily}, Inter, sans-serif`,
            '--pw-fg': t.colors.foreground,
            '--pw-muted': t.colors.mutedForeground,
            '--pw-primary': t.colors.primary,
            '--pw-border': t.colors.border,
            '--pw-body': `${t.typography.body.fontSize}pt`,
            '--pw-h1': `${t.typography.heading.fontSize.h1}pt`,
            '--pw-h2': `${t.typography.heading.fontSize.h2}pt`,
            '--pw-h3': `${t.typography.heading.fontSize.h3}pt`,
            '--pw-h4': `${t.typography.heading.fontSize.h4}pt`,
            '--pw-h5': `${t.typography.heading.fontSize.h5}pt`,
            '--pw-h6': `${t.typography.heading.fontSize.h6}pt`,
            '--pw-section-gap': `${t.spacing.sectionGap}pt`,
            '--pw-paragraph-gap': `${t.spacing.paragraphGap}pt`,
          } as React.CSSProperties)
        : {};
      return (
        <div className="pw-page" style={{ ...vars, width: `${width}pt`, minHeight: `${orientation === 'landscape' ? w : h}pt`, padding: `${marginTop}pt ${marginRight}pt ${marginBottom}pt ${marginLeft}pt` }}>
          <div className="pw-band pw-band-header">
            <Header minEmptyHeight={24} />
          </div>
          <div className="pw-body">{children}</div>
          <div className="pw-band pw-band-footer">
            <Footer minEmptyHeight={24} />
          </div>
        </div>
      );
    },
  },
  components: {
    Heading: {
      label: 'Heading',
      fields: {
        text: bindingText('Text'),
        level: { type: 'select', label: 'Level', options: [1, 2, 3, 4, 5, 6].map((n) => ({ label: `H${n}`, value: n })) },
        align: { type: 'radio', label: 'Align', options: alignOptions },
        keepWithNext: { type: 'radio', label: 'Keep with next block', options: yesNo },
      },
      defaultProps: { text: 'Heading', level: 2, align: 'left', keepWithNext: false },
      render: ({ text, level, align }) => <div className={`pw-heading pw-h${level}`} style={{ textAlign: align }}><Bound text={text} /></div>,
    },
    Text: {
      label: 'Paragraph',
      fields: {
        spans: spanFields,
        align: { type: 'radio', label: 'Align', options: [...alignOptions, { label: 'Justify', value: 'justify' }] },
      },
      defaultProps: { spans: [{ text: 'Paragraph text', bold: false, italic: false, underline: false, link: '', color: '' }], align: 'left' },
      render: ({ spans, align }) => (
        <p className="pw-text" style={{ textAlign: align }}>
          <Runs spans={spans} />
        </p>
      ),
    },
    Divider: {
      label: 'Divider',
      fields: { variant: { type: 'radio', label: 'Style', options: [{ label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }] } },
      defaultProps: { variant: 'solid' },
      render: ({ variant }) => <hr className="pw-divider" style={{ borderTopStyle: variant }} />,
    },
    Image: {
      label: 'Image',
      fields: {
        assetHash: assetField('Image'),
        width: { type: 'number', label: 'Width (pt)', min: 0 },
        height: { type: 'number', label: 'Height (pt, 0 = auto)', min: 0 },
        fit: { type: 'radio', label: 'Fit', options: [{ label: 'Contain', value: 'contain' }, { label: 'Cover', value: 'cover' }] },
        align: { type: 'radio', label: 'Align', options: alignOptions },
        caption: bindingText('Caption'),
      },
      defaultProps: { assetHash: '', width: 120, height: 0, fit: 'contain', align: 'left', caption: '' },
      render: ({ assetHash, width, height, fit, align, caption }) => (
        <div className="pw-image" style={{ textAlign: align }}>
          {assetHash ? <img src={`/api/assets/${assetHash}`} alt="" style={{ width: width ? `${width}pt` : undefined, height: height ? `${height}pt` : undefined, objectFit: fit }} /> : <div className="pw-placeholder">image: pick an asset</div>}
          {caption ? <div className="pw-caption"><Bound text={caption} /></div> : null}
        </div>
      ),
    },
    QRCode: {
      label: 'QR code',
      fields: { value: bindingText('Value (URL or text)'), size: { type: 'number', label: 'Size (pt)', min: 16 }, align: { type: 'radio', label: 'Align', options: alignOptions } },
      defaultProps: { value: '', size: 72, align: 'left' },
      render: ({ value, size, align }) => (
        <div style={{ textAlign: align }}>
          <div className="pw-qr" style={{ width: `${size}pt`, height: `${size}pt` }} title={value}>QR</div>
        </div>
      ),
    },
    KeyValue: {
      label: 'Key–value rows',
      fields: {
        items: { type: 'array', label: 'Rows', getItemSummary: (i) => i.key || 'row', defaultItemProps: { key: 'Label', value: '' }, arrayFields: { key: bindingText('Key'), value: bindingText('Value') } },
      },
      defaultProps: { items: [{ key: 'Label', value: '{{ value }}' }] },
      render: ({ items }) => (
        <div className="pw-kv">
          {(items ?? []).map((i, k) => (
            <div key={k} className="pw-kv-row"><span className="pw-kv-key"><Bound text={i.key} /></span><span className="pw-kv-value"><Bound text={i.value} /></span></div>
          ))}
        </div>
      ),
    },
    List: {
      label: 'List',
      fields: {
        variant: { type: 'radio', label: 'Style', options: [{ label: 'Bullets', value: 'bullet' }, { label: 'Numbered', value: 'numbered' }] },
        items: {
          type: 'array',
          label: 'Items',
          getItemSummary: (i) => (i.spans ?? []).map((s) => s.text).join('').slice(0, 40) || 'item',
          defaultItemProps: { spans: [{ text: '', bold: false, italic: false, underline: false, link: '', color: '' }] },
          arrayFields: { spans: spanFields },
        },
      },
      defaultProps: { variant: 'bullet', items: [{ spans: [{ text: 'First item', bold: false, italic: false, underline: false, link: '', color: '' }] }] },
      render: ({ variant, items }) => {
        const Tag = variant === 'numbered' ? 'ol' : 'ul';
        return <Tag className="pw-list">{(items ?? []).map((i, k) => <li key={k}><Runs spans={i.spans} /></li>)}</Tag>;
      },
    },
    Table: {
      label: 'Table (fixed rows)',
      fields: {
        variant: { type: 'select', label: 'Style', options: tableVariants },
        columns: { type: 'array', label: 'Columns', getItemSummary: (c) => c.header || c.key || 'column', defaultItemProps: { key: '', header: '', width: 0, align: 'left' }, arrayFields: { key: { type: 'text', label: 'Key' }, header: bindingText('Header'), width: { type: 'number', label: 'Width (fraction, 0 = share)', min: 0, max: 1, step: 0.05 }, align: { type: 'radio', label: 'Align', options: alignOptions } } },
        rows: { type: 'array', label: 'Rows', getItemSummary: (_r, i) => `Row ${(i ?? 0) + 1}`, defaultItemProps: { cells: [] }, arrayFields: { cells: { type: 'array', label: 'Cells', getItemSummary: (c) => c.value || 'cell', defaultItemProps: { value: '' }, arrayFields: { value: bindingText('Value') } } } },
      },
      defaultProps: { variant: 'line', columns: [{ key: 'a', header: 'Column A', width: 0, align: 'left' }, { key: 'b', header: 'Column B', width: 0, align: 'right' }], rows: [{ cells: [{ value: '' }, { value: '' }] }] },
      render: ({ columns, rows }) => (
        <table className="pw-table">
          <thead><tr>{(columns ?? []).map((c, i) => <th key={i} style={{ textAlign: c.align, width: c.width ? `${c.width * 100}%` : undefined }}><Bound text={c.header} /></th>)}</tr></thead>
          <tbody>{(rows ?? []).map((r, k) => <tr key={k}>{(columns ?? []).map((c, i) => <td key={i} style={{ textAlign: c.align }}><Bound text={r.cells?.[i]?.value ?? ''} /></td>)}</tr>)}</tbody>
        </table>
      ),
    },
    DataTable: {
      label: 'Data table (rows from data)',
      fields: {
        rowBinding: pathText('Rows from (path to an array)'),
        variant: { type: 'select', label: 'Style', options: tableVariants },
        columns: { type: 'array', label: 'Columns', getItemSummary: (c) => c.header || c.key || 'column', defaultItemProps: { key: '', header: '', cell: '', width: 0, align: 'left' }, arrayFields: { key: { type: 'text', label: 'Key' }, header: bindingText('Header'), cell: bindingText('Cell (relative to each row)'), width: { type: 'number', label: 'Width (fraction, 0 = share)', min: 0, max: 1, step: 0.05 }, align: { type: 'radio', label: 'Align', options: alignOptions } } },
        emptyText: bindingText('Text when there are no rows'),
      },
      defaultProps: { rowBinding: 'items', variant: 'line', emptyText: '', columns: [{ key: 'description', header: 'Description', cell: '{{ description }}', width: 0, align: 'left' }, { key: 'amount', header: 'Amount', cell: '{{ amount | currency:GHS }}', width: 0.2, align: 'right' }] },
      render: ({ rowBinding, columns }) => (
        <div className="pw-datatable">
          <table className="pw-table">
            <thead><tr>{(columns ?? []).map((c, i) => <th key={i} style={{ textAlign: c.align, width: c.width ? `${c.width * 100}%` : undefined }}><Bound text={c.header} /></th>)}</tr></thead>
            <tbody>
              <tr>{(columns ?? []).map((c, i) => <td key={i} style={{ textAlign: c.align }}><Bound text={c.cell} /></td>)}</tr>
              <tr className="pw-datatable-more"><td colSpan={Math.max(1, (columns ?? []).length)}>… one row per item in <span className="pw-binding">{rowBinding || '?'}</span></td></tr>
            </tbody>
          </table>
        </div>
      ),
    },
    Section: {
      label: 'Section',
      fields: { title: bindingText('Title'), content: { type: 'slot' } },
      defaultProps: { title: 'Section', content: [] },
      render: ({ title, content: Content }) => (
        <section className="pw-section">
          {title ? <div className="pw-heading pw-h3"><Bound text={title} /></div> : null}
          <Content minEmptyHeight={40} />
        </section>
      ),
    },
    Columns: {
      label: 'Columns',
      fields: {
        columns: { type: 'array', label: 'Columns', getItemSummary: (_c, i) => `Column ${(i ?? 0) + 1}`, defaultItemProps: { width: 0, content: [] }, arrayFields: { width: { type: 'number', label: 'Width (fraction, 0 = share)', min: 0, max: 1, step: 0.05 }, content: { type: 'slot', disallow: ['PageBreak'] } } },
        gap: { type: 'number', label: 'Gap (pt, 0 = theme)', min: 0 },
        align: { type: 'radio', label: 'Vertical align', options: [{ label: 'Top', value: 'top' }, { label: 'Middle', value: 'middle' }, { label: 'Bottom', value: 'bottom' }] },
      },
      defaultProps: { columns: [{ width: 0, content: [] }, { width: 0, content: [] }], gap: 0, align: 'top' },
      render: ({ columns, gap, align }) => (
        <div className="pw-columns" style={{ gap: `${gap || 24}pt`, alignItems: { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[align] }}>
          {(columns ?? []).map(({ width, content: Content }, i) => (
            <div key={i} className="pw-column" style={columnStyle(width)}>
              <Content minEmptyHeight={40} />
            </div>
          ))}
        </div>
      ),
    },
    Repeat: {
      label: 'Repeat (for each)',
      fields: { forEach: pathText('For each item in (path to an array)'), as: { type: 'text', label: 'Call each item' }, content: { type: 'slot' } },
      defaultProps: { forEach: 'items', as: 'item', content: [] },
      render: ({ forEach, as, content: Content }) => (
        <Frame label={`repeat for each ${as || 'item'} in ${forEach || '?'}`} tone="logic"><Content minEmptyHeight={40} /></Frame>
      ),
    },
    If: {
      label: 'If (conditional)',
      fields: { test: bindingText('Show when this has a value ({{ path }}, filters allowed)'), whenTrue: { type: 'slot', label: 'Then' }, whenFalse: { type: 'slot', label: 'Otherwise' } },
      defaultProps: { test: '{{ flag }}', whenTrue: [], whenFalse: [] },
      render: ({ test, whenTrue: Then, whenFalse: Otherwise }) => (
        <Frame label={`if ${test || '?'}`} tone="logic">
          <Then minEmptyHeight={32} />
          <div className="pw-frame-label">otherwise</div>
          <Otherwise minEmptyHeight={24} />
        </Frame>
      ),
    },
    KeepTogether: {
      label: 'Keep together',
      fields: { content: { type: 'slot', disallow: ['PageBreak'] } },
      defaultProps: { content: [] },
      render: ({ content: Content }) => <Frame label="keep together on one page"><Content minEmptyHeight={40} /></Frame>,
    },
    PageBreak: {
      label: 'Page break',
      fields: {},
      defaultProps: {},
      render: () => <div className="pw-pagebreak">page break</div>,
    },
    Signature: {
      label: 'Signature',
      fields: {
        variant: { type: 'radio', label: 'Layout', options: [{ label: 'Block', value: 'single' }, { label: 'Inline', value: 'inline' }] },
        name: bindingText('Name'),
        title: bindingText('Title'),
        date: bindingText('Date'),
        assetHash: assetField('Signature image (optional)', true),
      },
      defaultProps: { variant: 'single', name: '', title: '', date: '', assetHash: '' },
      render: ({ name, title, date, assetHash }) => (
        <div className="pw-signature">
          <div className="pw-muted">Signature</div>
          {assetHash ? <img src={`/api/assets/${assetHash}`} alt="" style={{ height: '40pt' }} /> : <div style={{ height: '28pt' }} />}
          <div className="pw-signature-line" />
          {name ? <div><strong><Bound text={name} /></strong></div> : null}
          {title ? <div className="pw-muted"><Bound text={title} /></div> : null}
          {date ? <div className="pw-muted pw-small"><Bound text={date} /></div> : null}
        </div>
      ),
    },
    Watermark: {
      label: 'Watermark',
      fields: { text: bindingText('Text'), opacity: { type: 'number', label: 'Opacity (0–1)', min: 0, max: 1, step: 0.02 } },
      defaultProps: { text: 'DRAFT', opacity: 0.08 },
      render: ({ text }) => <div className="pw-watermark">watermark: <Bound text={text} /></div>,
    },
    PageNumber: {
      label: 'Page number',
      fields: { format: { type: 'text', label: 'Format ({page}, {total})' }, align: { type: 'radio', label: 'Align', options: alignOptions } },
      defaultProps: { format: 'Page {page} of {total}', align: 'center' },
      render: ({ format, align }) => <div className="pw-muted pw-small" style={{ textAlign: align }}>{format.replace('{page}', '1').replace('{total}', 'N')}</div>,
    },
  },
  };
}
