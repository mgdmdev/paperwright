import { describe, expect, it } from 'vitest';
import { renderPdf } from '../src/index';
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

  it('falls back to the professional theme with a warning for an unknown theme name', async () => {
    const input = await loadExample('letter');
    const result = await renderPdf({ ...input, model: { ...input.model, theme: 'elegant' } });
    expect(result.warnings).toEqual(['Unknown theme "elegant"; using professional']);
  });
});
