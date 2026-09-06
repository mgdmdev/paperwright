import { describe, expect, it } from 'vitest';
import { createFormeEngine, createTakumiEngine, renderPdf } from '../src/index';
import type { DocumentEngine } from '../src/index';
import { EXAMPLE_NAMES, loadExample } from './examples';
import { summarizePdf } from './pdf-text';

const engines: DocumentEngine[] = [createFormeEngine(), createTakumiEngine()];

describe.each(engines)('renderPdf on $name', (engine) => {
  it.each(EXAMPLE_NAMES)('renders the %s example without warnings and matches its golden text', async (name) => {
    const input = await loadExample(name);
    const result = await renderPdf(input, { engine });
    expect(result.warnings).toEqual([]);
    expect(result.engine).toBe(engine.name);
    expect(Buffer.from(result.bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');

    const summary = await summarizePdf(result.bytes);
    expect(summary.title).toBe(input.model.name);
    expect(summary.pages).toBeGreaterThan(0);
    // The golden is the text layer per page: what a reader sees, in reading order.
    expect(summary).toMatchSnapshot();
  });

  it('repeats header and footer bands and numbers pages', async () => {
    const input = await loadExample('invoice');
    const result = await renderPdf(input, { engine });
    const summary = await summarizePdf(result.bytes);
    expect(summary.pages).toBe(2);
    expect(summary.text[0]).toContain('Page 1 of 2');
    expect(summary.text[1]).toContain('Page 2 of 2');
  });

  it('reports a missing asset as a warning, not a failure', async () => {
    const input = await loadExample('letter');
    const result = await renderPdf({ ...input, assets: new Map() }, { engine });
    expect(result.warnings.some((w) => w.includes('no bytes for asset'))).toBe(true);
    expect(result.bytes.length).toBeGreaterThan(1000);
  });

  it('honours a locale override through the filters', async () => {
    const input = await loadExample('invoice');
    const result = await renderPdf({ ...input, locale: 'fr-FR' }, { engine });
    const summary = await summarizePdf(result.bytes);
    expect(summary.text[0]).toContain('1 septembre 2026');
  });
});
