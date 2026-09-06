import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateModel } from '@docform/model';
import type { DocumentModel, RenderData } from '@docform/model';

const examples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../examples/basic');

export const EXAMPLE_NAMES = ['invoice', 'letter', 'payslip'] as const;

export async function loadExample(name: (typeof EXAMPLE_NAMES)[number]): Promise<{
  model: DocumentModel;
  data: RenderData;
  assets: Map<string, Uint8Array>;
}> {
  const model = migrateModel(JSON.parse(await readFile(path.join(examples, `templates/${name}.json`), 'utf8')));
  const data = JSON.parse(await readFile(path.join(examples, `data/${name}.json`), 'utf8')) as RenderData;
  const logo = new Uint8Array(await readFile(path.join(examples, 'assets/logo.png')));
  const hash = (await readFile(path.join(examples, 'assets/logo.hash'), 'utf8')).trim();
  return { model, data, assets: new Map([[hash, logo]]) };
}
