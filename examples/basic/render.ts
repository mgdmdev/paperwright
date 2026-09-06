import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateModel } from '@paperwright/model';
import { createFormeEngine, createTakumiEngine, renderPdf } from '@paperwright/render-pdf';

const here = path.dirname(fileURLToPath(import.meta.url));
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['invoice', 'letter', 'payslip'];
const engines = [createFormeEngine(), createTakumiEngine()];

const logo = new Uint8Array(await readFile(path.join(here, 'assets/logo.png')));
const logoHash = (await readFile(path.join(here, 'assets/logo.hash'), 'utf8')).trim();
await mkdir(path.join(here, 'out'), { recursive: true });

for (const name of names) {
  const model = migrateModel(JSON.parse(await readFile(path.join(here, `templates/${name}.json`), 'utf8')));
  const data = JSON.parse(await readFile(path.join(here, `data/${name}.json`), 'utf8'));
  for (const engine of engines) {
    const started = performance.now();
    const result = await renderPdf({ model, data, assets: new Map([[logoHash, logo]]) }, { engine });
    const file = path.join(here, 'out', `${name}.${engine.name}.pdf`);
    await writeFile(file, result.bytes);
    const ms = Math.round(performance.now() - started);
    console.log(`${name}.${engine.name}.pdf  ${result.bytes.length} bytes  ${ms} ms${result.warnings.length ? `\n  warnings: ${result.warnings.join('; ')}` : ''}`);
  }
}
