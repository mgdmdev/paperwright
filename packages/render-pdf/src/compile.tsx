import type { CSSProperties, ReactElement, ReactNode } from 'react';
import * as Forme from '@formepdf/react';
import { forme, takumi, themePresets } from '@docform/react';
import type { PdfcnTheme, ThemePresetName } from '@docform/react';
import type { ResolvedBlock, Span, TableBlock, TableColumn } from '@docform/model';
import type { Base } from './engine';

export interface CompileContext {
  base: Base;
  theme: PdfcnTheme;
  /** Resolves an asset hash to the src the engine reads, or undefined when the asset is missing. */
  assetSrc: (hash: string) => string | undefined;
  /** Width of the page content box in points; tables size their columns from it. */
  contentWidth: number;
  warnings: string[];
}

/** Both bases expose the same component API; the runtime value is the base the engine renders. */
type Components = typeof takumi;
const componentsFor = (base: Base): Components => (base === 'forme' ? (forme as unknown as Components) : takumi);

export function themeFor(name: string | undefined, fontFamily: string | undefined, warnings: string[]): PdfcnTheme {
  const preset = (name ?? 'professional') as ThemePresetName;
  let theme: PdfcnTheme = themePresets[preset] ?? themePresets.professional;
  if (!themePresets[preset]) warnings.push(`Unknown theme "${name}"; using professional`);
  if (fontFamily) theme = withFontFamily(theme, fontFamily);
  return theme;
}

/** Points every typography slot at one family, so a theme renders with the fonts the host registered. */
export function withFontFamily(theme: PdfcnTheme, family: string): PdfcnTheme {
  const typography = Object.fromEntries(
    Object.entries(theme.typography).map(([key, value]) => [
      key,
      value && typeof value === 'object' && 'fontFamily' in value ? { ...value, fontFamily: family } : value,
    ]),
  ) as PdfcnTheme['typography'];
  return { ...theme, typography };
}

/** Wraps compiled content in the theme provider of the right base. */
export function withTheme(ctx: CompileContext, children: ReactNode): ReactElement {
  const C = componentsFor(ctx.base);
  return <C.PdfcnThemeProvider theme={ctx.theme}>{children}</C.PdfcnThemeProvider>;
}

export function compileBlocks(blocks: ResolvedBlock[], ctx: CompileContext): ReactNode[] {
  return blocks.map((block) => compileBlock(block, ctx));
}

const ALIGN_ITEMS = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

function compileBlock(block: ResolvedBlock, ctx: CompileContext): ReactNode {
  const C = componentsFor(ctx.base);
  const P = C.primitives;
  switch (block.type) {
    case 'heading':
      return (
        <C.Heading key={block.id} level={block.level} keepWithNext={block.keepWithNext}>
          {block.text as string}
        </C.Heading>
      );
    case 'text':
      return (
        <C.Text key={block.id} align={block.rich.align}>
          {compileSpans(block.rich.spans, ctx)}
        </C.Text>
      );
    case 'divider':
      return <C.Divider key={block.id} variant={block.variant} />;
    case 'image': {
      const src = ctx.assetSrc(block.assetHash);
      if (!src) {
        ctx.warnings.push(`Block "${block.id}": no bytes for asset ${block.assetHash}`);
        return null;
      }
      const image = (
        <C.PdfImage src={src} width={block.width} height={block.height} fit={block.fit} caption={block.caption as string | undefined} />
      );
      return block.align ? (
        <P.View key={block.id} style={{ alignItems: ALIGN_ITEMS[block.align] }}>
          {image}
        </P.View>
      ) : (
        <P.View key={block.id}>{image}</P.View>
      );
    }
    case 'qrcode':
      return (
        <P.View key={block.id} style={{ alignItems: ALIGN_ITEMS[block.align ?? 'left'] }}>
          <C.PdfQRCode value={block.value as string} size={block.size} />
        </P.View>
      );
    case 'keyValue':
      return <C.KeyValue key={block.id} items={block.items.map((i) => ({ key: i.key as string, value: i.value as string }))} />;
    case 'list':
      // The list component takes plain strings per item; span formatting is dropped here.
      return (
        <C.PdfList
          key={block.id}
          variant={block.variant}
          items={block.items.map((item) => ({ text: item.spans.map((s) => s.text as string).join('') }))}
        />
      );
    case 'table':
      return compileTable(block, ctx);
    case 'section':
      return (
        // The heading carries the rhythm (top gap, small bottom gap); the section itself adds none,
        // since every block inside already ends with its own bottom margin.
        <C.Section key={block.id} spacing="none">
          {block.title !== undefined && (
            <C.Heading level={3} keepWithNext>
              {block.title as string}
            </C.Heading>
          )}
          {compileBlocks(block.blocks as ResolvedBlock[], ctx)}
        </C.Section>
      );
    case 'keepTogether':
      return <C.KeepTogether key={block.id}>{compileBlocks(block.blocks as ResolvedBlock[], ctx)}</C.KeepTogether>;
    case 'pageBreak':
      return <C.PageBreak key={block.id} />;
    case 'signature': {
      const src = block.mode === 'captured' && block.assetHash ? ctx.assetSrc(block.assetHash) : undefined;
      if (block.mode === 'captured' && !src) ctx.warnings.push(`Block "${block.id}": no bytes for signature asset`);
      const image = src ? <C.PdfImage src={src} height={40} fit="contain" noWrap={false} /> : undefined;
      return (
        <C.PdfSignatureBlock
          key={block.id}
          variant={block.variant ?? 'single'}
          name={block.signer.name as string | undefined}
          title={block.signer.title as string | undefined}
          date={block.signer.date as string | undefined}
          image={image}
        />
      );
    }
    case 'watermark':
      return <C.PdfWatermark key={block.id} text={block.text as string} opacity={block.opacity} />;
    case 'pageNumber':
      return <C.PageNumber key={block.id} format={block.format} align={block.align} />;
  }
}

// ─── Rich text ────────────────────────────────────────────────────────────────

const isPlain = (span: Span) => !span.bold && !span.italic && !span.underline && !span.color && !span.link;

export function compileSpans(spans: Span[], ctx: CompileContext): ReactNode {
  if (spans.every(isPlain)) return spans.map((s) => s.text as string).join('');
  return spans.map((span, i) => compileSpan(span, i, ctx));
}

function compileSpan(span: Span, key: number, ctx: CompileContext): ReactNode {
  const text = span.text as string;
  if (isPlain(span)) return text;
  const link = span.link as string | undefined;
  if (ctx.base === 'forme') {
    const style: Record<string, unknown> = {};
    if (span.bold) style.fontWeight = 700;
    if (span.italic) style.fontStyle = 'italic';
    if (span.underline) style.textDecoration = 'underline';
    if (span.color) style.color = span.color;
    return link ? (
      <Forme.Link key={key} href={link} style={style as Forme.Style}>
        {text}
      </Forme.Link>
    ) : (
      <Forme.Text key={key} style={style as Forme.Style}>
        {text}
      </Forme.Text>
    );
  }
  const style: CSSProperties = {};
  if (span.bold) style.fontWeight = 700;
  if (span.italic) style.fontStyle = 'italic';
  if (span.underline) style.textDecoration = 'underline';
  if (span.color) style.color = span.color;
  return link ? (
    <a key={key} href={link} style={style}>
      {text}
    </a>
  ) : (
    <span key={key} style={style}>
      {text}
    </span>
  );
}

// ─── Tables ───────────────────────────────────────────────────────────────────
//
// Tables go straight to each engine's native table so the header row repeats on every page the
// table continues onto; the vendored Table component draws rows as flex boxes and cannot. The
// theme's table styles are reused so both paths look the same.

type Style = Record<string, unknown>;
type TableStyles = ReturnType<typeof takumi.createTableStyles>;
type Variant = NonNullable<TableBlock['variant']>;

const VARIANT_KEYS: Record<Variant, { table: keyof TableStyles; row: keyof TableStyles; rowHeader: keyof TableStyles; headerText: keyof TableStyles; cell?: keyof TableStyles }> = {
  line: { table: 'tableLine', row: 'rowLine', rowHeader: 'rowHeaderLine', headerText: 'cellTextHeaderLine' },
  grid: { table: 'tableGrid', row: 'rowGrid', rowHeader: 'rowHeaderGrid', headerText: 'cellTextHeaderGrid' },
  bordered: { table: 'tableBordered', row: 'rowBordered', rowHeader: 'rowHeaderBordered', headerText: 'cellTextHeaderBordered', cell: 'cellBordered' },
  striped: { table: 'tableStriped', row: 'rowStriped', rowHeader: 'rowHeaderStriped', headerText: 'cellTextHeaderStriped', cell: 'cellStriped' },
  compact: { table: 'tableCompact', row: 'rowCompact', rowHeader: 'rowHeaderCompact', headerText: 'cellTextHeaderCompact', cell: 'cellCompact' },
  minimal: { table: 'tableMinimal', row: 'rowMinimal', rowHeader: 'rowHeaderMinimal', headerText: 'cellTextHeaderMinimal', cell: 'cellMinimal' },
};

/** Flex-row properties from the theme's row and cell styles do not apply to real table cells. */
const LAYOUT_KEYS = new Set(['display', 'flexDirection', 'flex', 'flexGrow', 'flexShrink', 'alignItems', 'justifyContent', 'width']);
const stripLayout = (style: Style): Style => Object.fromEntries(Object.entries(style).filter(([k]) => !LAYOUT_KEYS.has(k)));

const merge = (...styles: (Style | undefined)[]): Style => Object.assign({}, ...styles.filter((s): s is Style => s !== undefined));

/**
 * Fractions for every column: declared widths first, the rest shared equally. Widths that add up
 * to more than the table (the schema rejects them, but a model can still arrive unvalidated) are
 * treated as weights and scaled, so no column vanishes.
 */
export function columnFractions(columns: TableColumn[], warn?: (message: string) => void): number[] {
  const declared = columns.reduce((sum, c) => sum + (c.width ?? 0), 0);
  const open = columns.filter((c) => c.width === undefined).length;
  if (declared > 1.0001) {
    warn?.(`column widths add up to ${declared.toFixed(2)}; scaled to fit`);
    const mean = declared / (columns.length - open || 1);
    const weights = columns.map((c) => c.width ?? mean);
    const total = weights.reduce((sum, w) => sum + w, 0);
    return weights.map((w) => w / total);
  }
  const share = open ? (1 - declared) / open : 0;
  return columns.map((c) => c.width ?? share);
}

function compileTable(block: TableBlock, ctx: CompileContext): ReactNode {
  const C = componentsFor(ctx.base);
  const styles = C.createTableStyles(ctx.theme) as unknown as Record<keyof TableStyles, Style>;
  const variant = block.variant ?? 'line';
  const keys = VARIANT_KEYS[variant];
  const fractions = columnFractions(block.columns, (m) => ctx.warnings.push(`Block "${block.id}": ${m}`));
  const zebra = variant === 'striped';

  const tableStyle = merge(stripLayout(styles.table), stripLayout(styles[keys.table]));
  const headerRowStyle = merge(stripLayout(styles.row), stripLayout(styles[keys.row]), stripLayout(styles[keys.rowHeader]));
  const rowStyle = merge(stripLayout(styles.row), stripLayout(styles[keys.row]));
  const last = block.columns.length - 1;
  const cellStyle = (i: number, align: TableColumn['align']) =>
    merge(
      stripLayout(styles.cell),
      keys.cell ? stripLayout(styles[keys.cell]) : undefined,
      i < last && variant === 'grid' ? styles.cellGridBorder : undefined,
      i < last && variant === 'bordered' ? styles.cellBorderedBorder : undefined,
      align ? { textAlign: align } : undefined,
    );
  const headerText = merge(styles[keys.headerText], { margin: 0, padding: 0 });
  const bodyText = merge(variant === 'compact' ? styles.cellTextCompact : styles.cellText, { margin: 0, padding: 0 });

  if (ctx.base === 'forme') {
    const S = (s: Style) => s as Forme.Style;
    return (
      <Forme.Table key={block.id} columns={fractions.map((f) => ({ width: { fraction: f } }))} style={S(tableStyle)}>
        <Forme.Row header style={S(headerRowStyle)}>
          {block.columns.map((col, i) => (
            <Forme.Cell key={col.key} style={S(cellStyle(i, col.align))}>
              <Forme.Text style={S(merge(headerText, col.align ? { textAlign: col.align } : undefined))}>{col.header as string}</Forme.Text>
            </Forme.Cell>
          ))}
        </Forme.Row>
        {block.rows.map((row, r) => (
          <Forme.Row key={r} style={S(merge(rowStyle, zebra && r % 2 === 1 ? styles.rowStripe : undefined))}>
            {row.map((cell, i) => {
              const align = block.columns[i]?.align;
              return (
                <Forme.Cell key={i} style={S(cellStyle(i, align))}>
                  <Forme.Text style={S(merge(bodyText, align ? { textAlign: align } : undefined))}>{cell as string}</Forme.Text>
                </Forme.Cell>
              );
            })}
          </Forme.Row>
        ))}
      </Forme.Table>
    );
  }

  const css = (s: Style) => takumi.primitives.flatten(s) as CSSProperties;
  // Takumi ignores <col> widths; a width on the header cell sizes the column. Points → CSS px.
  const columnPx = (i: number) => Math.round((fractions[i] ?? 0) * ctx.contentWidth * takumi.primitives.PDF_POINT_TO_CSS_PIXEL * 100) / 100;
  return (
    <table key={block.id} style={{ ...css(tableStyle), borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr style={css(headerRowStyle)}>
          {block.columns.map((col, i) => (
            <th key={col.key} style={{ textAlign: col.align ?? 'left', ...css(cellStyle(i, col.align)), fontWeight: 'inherit', width: columnPx(i) }}>
              <span style={css(headerText)}>{col.header as string}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((row, r) => (
          <tr key={r} style={css(merge(rowStyle, zebra && r % 2 === 1 ? styles.rowStripe : undefined))}>
            {row.map((cell, i) => (
              <td key={i} style={css(cellStyle(i, block.columns[i]?.align))}>
                <span style={css(bodyText)}>{cell as string}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
