// Compares the widths a PDF declares for a CID font (/W) with the advance widths inside the
// embedded TrueType program (hmtx), for the glyphs the first page uses.
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
function hmtx(font) {
  const numTables = u16(font, 4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tables[String.fromCharCode(...font.subarray(o, o + 4))] = { off: u32(font, o + 8), len: u32(font, o + 12) };
  }
  const upem = u16(font, tables.head.off + 18);
  const n = u16(font, tables.hhea.off + 34);
  const widths = [];
  for (let g = 0; g < n; g++) widths.push(u16(font, tables.hmtx.off + g * 4));
  return { upem, widths, numHMetrics: n, tables: Object.keys(tables) };
}

for (const file of process.argv.slice(2)) {
  const pdf = await getDocument({ data: new Uint8Array(await readFile(file)), verbosity: 0, fontExtraProperties: true, disableFontFace: true }).promise;
  const page = await pdf.getPage(1);
  await page.getOperatorList();
  const content = await page.getTextContent();
  const fontIds = [...new Set(content.items.map((i) => i.fontName))];
  for (const id of fontIds) {
    const f = page.commonObjs.get(id);
    const prog = f.data ? hmtx(f.data) : null;
    const declared = f.widths ?? {};
    console.log(`=== ${file} ${f.name} upem=${prog?.upem} hmetrics=${prog?.numHMetrics} defaultWidth=${f.defaultWidth} vmetrics=${!!f.vmetrics} tables=${prog?.tables.join(',')}`);
    const rows = [];
    for (const [cid, w] of Object.entries(declared)) {
      const gid = Number(cid);
      const emb = prog ? Math.round((prog.widths[Math.min(gid, prog.numHMetrics - 1)] ?? 0) * 1000 / prog.upem) : null;
      const ch = f.toUnicode?.lookup?.(gid) ?? '';
      if (emb !== null && Math.abs(emb - w) > 2) rows.push(`gid ${gid} '${ch}': /W ${w} vs hmtx ${emb}`);
    }
    console.log(rows.length ? rows.slice(0, 12).join('\n') : 'all declared widths match the embedded hmtx', rows.length > 12 ? `\n... ${rows.length} mismatches` : '');
  }
}
