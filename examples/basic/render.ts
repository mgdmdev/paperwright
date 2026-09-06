import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateModel } from '@paperwright/model';
import { renderPdf } from '@paperwright/pdf';

const here = path.dirname(fileURLToPath(import.meta.url));
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['invoice', 'letter', 'payslip', 'certificate'];

const logo = new Uint8Array(await readFile(path.join(here, 'assets/logo.png')));
const logoHash = (await readFile(path.join(here, 'assets/logo.hash'), 'utf8')).trim();
await mkdir(path.join(here, 'out'), { recursive: true });

for (const name of names) {
  const model = migrateModel(JSON.parse(await readFile(path.join(here, `templates/${name}.json`), 'utf8')));
  const data = JSON.parse(await readFile(path.join(here, `data/${name}.json`), 'utf8'));
  const started = performance.now();
  const result = await renderPdf({ model, data, assets: new Map([[logoHash, logo]]) });
  const file = path.join(here, 'out', `${name}.pdf`);
  await writeFile(file, result.bytes);
  const ms = Math.round(performance.now() - started);
  console.log(`${name}.pdf  ${result.bytes.length} bytes  ${ms} ms${result.warnings.length ? `\n  warnings: ${result.warnings.join('; ')}` : ''}`);
}
