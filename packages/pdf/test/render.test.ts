import { describe, expect, it } from 'vitest';
import { renderPdf, themePresets } from '../src/index';
import { EXAMPLE_NAMES, loadExample } from './examples';
import { summarizePdf } from './pdf-text';

describe('renderPdf', () => {
  it.each(EXAMPLE_NAMES)('renders the %s example without warnings and matches its golden text', async (name) => {
    const input = await loadExample(name);
    const result = await renderPdf(input);
    expect(result.warnings).toEqual([]);
    expect(result.engine).toBe('forme');
    expect(Buffer.from(result.bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');

    const summary = await summarizePdf(result.bytes);
    expect(summary.title).toBe(input.model.name);
    expect(summary.pages).toBeGreaterThan(0);
    // The golden is the text layer per page: what a reader sees, in reading order.
    expect(summary).toMatchSnapshot();
  });

  it('repeats header and footer bands and numbers pages', async () => {
    const input = await loadExample('invoice');
    const summary = await summarizePdf((await renderPdf(input)).bytes);
    expect(summary.pages).toBe(2);
    expect(summary.text[0]).toContain('Page 1 of 2');
    expect(summary.text[1]).toContain('Page 2 of 2');
  });

  it('repeats a table header row across a page break', async () => {
    const input = await loadExample('payslip');
    const summary = await summarizePdf((await renderPdf(input)).bytes);
    const pagesWithYtdHeader = summary.text.filter((t) => t.includes('YEAR TO DATE')).length;
    expect(summary.pages).toBe(2);
    expect(pagesWithYtdHeader).toBe(2);
  });

  it('reports a missing asset as a warning, not a failure', async () => {
    const input = await loadExample('letter');
    const result = await renderPdf({ ...input, assets: new Map() });
    expect(result.warnings.some((w) => w.includes('no bytes for asset'))).toBe(true);
    expect(result.bytes.length).toBeGreaterThan(1000);
  });

  it('honours a locale override through the filters', async () => {
    const input = await loadExample('invoice');
    const summary = await summarizePdf((await renderPdf({ ...input, locale: 'fr-FR' })).bytes);
    expect(summary.text[0]).toContain('1 septembre 2026');
  });

  it('takes a theme name, a theme object and brand overrides from the options', async () => {
    const input = await loadExample('letter');
    const byName = await renderPdf(input, { theme: 'minimal' });
    expect(byName.warnings).toEqual([]);
    const brand = { ...themePresets.professional, colors: { ...themePresets.professional.colors, primary: '#7a1f1f' } };
    const byObject = await renderPdf({ ...input, model: { ...input.model, theme: 'nonsense' } }, { theme: brand });
    expect(byObject.warnings).toEqual([]);
    const overridden = await renderPdf(input, {
      themeOverrides: { colors: { primary: '#7a1f1f' }, spacing: { sectionGap: 40 } },
    });
    expect(overridden.warnings).toEqual([]);
    expect((await summarizePdf(overridden.bytes)).text[0]).toContain('Renewal of the design retainer');
  });

  it('makes a paragraph with a link clickable and keeps a heading with its next block', async () => {
    const input = await loadExample('certificate');
    const summary = await summarizePdf((await renderPdf(input)).bytes);
    expect(summary.links).toEqual(['https://verify.northwind.example/c/NWA-2026-01187']);

    const filler = Array.from({ length: 30 }, (_, i) => ({ id: `f${i}`, type: 'text' as const, rich: { spans: [{ text: `Paragraph ${i} of filler text that takes a line.` }] } }));
    const model = { ...input.model, page: { ...input.model.page, orientation: 'portrait' as const }, blocks: [...filler, { id: 'h', type: 'heading' as const, level: 3 as const, text: 'Pinned heading', keepWithNext: true }, { id: 'p', type: 'text' as const, rich: { spans: [{ text: 'The paragraph that follows the heading.' }] } }] };
    const pinned = await summarizePdf((await renderPdf({ ...input, model })).bytes);
    const headingPage = pinned.text.findIndex((t) => t.includes('Pinned heading'));
    const paragraphPage = pinned.text.findIndex((t) => t.includes('The paragraph that follows'));
    expect(headingPage).toBeGreaterThanOrEqual(0);
    expect(paragraphPage).toBe(headingPage);
  });

  it('drops a pageBreak inside a band with a warning instead of losing the band', async () => {
    const input = await loadExample('letter');
    const model = { ...input.model, header: [{ id: 'hh', type: 'heading' as const, level: 4 as const, text: 'HEAD' }, { id: 'hb', type: 'pageBreak' as const }, { id: 'hh2', type: 'heading' as const, level: 4 as const, text: 'HEAD2' }] };
    const result = await renderPdf({ ...input, model });
    expect(result.warnings).toEqual(['Block "hb": a pageBreak inside a band, column or keepTogether is ignored']);
    expect((await summarizePdf(result.bytes)).text[0]).toMatch(/HEAD \| HEAD2/);
  });

  it('falls back to the professional theme with a warning for an unknown theme name', async () => {
    const input = await loadExample('letter');
    const result = await renderPdf({ ...input, model: { ...input.model, theme: 'elegant' } });
    expect(result.warnings).toEqual(['Unknown theme "elegant"; using professional']);
  });
});
