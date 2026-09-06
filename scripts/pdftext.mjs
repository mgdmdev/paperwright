import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
for (const file of process.argv.slice(2)) {
  const data = new Uint8Array(await readFile(file));
  const pdf = await getDocument({ data, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  const meta = await pdf.getMetadata();
  console.log(`=== ${file}: ${pdf.numPages} page(s); title=${meta.info?.Title} producer=${meta.info?.Producer}`);
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const fonts = new Set(content.items.map((i) => i.fontName));
    const text = content.items.map((i) => i.str).filter(Boolean).join(' | ');
    console.log(`-- page ${p} (${[...fonts].join(',')}):\n${text.slice(0, 900)}`);
  }
}
