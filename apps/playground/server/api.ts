import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { validateModel } from '@paperwright/model';
import type { RenderData } from '@paperwright/model';
import { renderPdf } from '@paperwright/pdf';
import type { ThemeOverrides } from '@paperwright/pdf';

/**
 * The playground's API, served by the Vite dev server itself so there is one process to run.
 * GET  /api/examples  → the example templates and data
 * POST /api/render    → { model, data, theme?, themeOverrides? } → application/pdf, or 400 with issues
 * Assets are the example images, keyed by the same content hash the templates use.
 */
export function playgroundApi(examplesDir: string): Plugin {
  const assets = new Map<string, Uint8Array>();

  const loadAssets = async () => {
    for (const file of await readdir(path.join(examplesDir, 'assets'))) {
      if (!/\.(png|jpe?g)$/i.test(file)) continue;
      const bytes = new Uint8Array(await readFile(path.join(examplesDir, 'assets', file)));
      assets.set(createHash('sha256').update(bytes).digest('hex').slice(0, 16), bytes);
    }
  };

  const readJson = (req: IncomingMessage): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };

  return {
    name: 'paperwright-playground-api',
    async configureServer(server) {
      await loadAssets();
      server.middlewares.use('/api/examples', async (_req, res) => {
        const names = (await readdir(path.join(examplesDir, 'templates'))).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
        const examples: Record<string, { template: unknown; data: unknown }> = {};
        for (const name of names) {
          examples[name] = {
            template: JSON.parse(await readFile(path.join(examplesDir, `templates/${name}.json`), 'utf8')),
            data: JSON.parse(await readFile(path.join(examplesDir, `data/${name}.json`), 'utf8')),
          };
        }
        json(res, 200, { names, examples, assets: [...assets.keys()] });
      });
      server.middlewares.use('/api/render', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
        let body: { model?: unknown; data?: RenderData; theme?: string; themeOverrides?: ThemeOverrides; locale?: string };
        try {
          body = (await readJson(req)) as typeof body;
        } catch {
          return json(res, 400, { error: 'Body is not JSON' });
        }
        const validated = validateModel(body.model);
        if (!validated.ok) return json(res, 400, { issues: validated.issues });
        try {
          const started = performance.now();
          const result = await renderPdf(
            { model: validated.model, data: body.data ?? {}, assets, locale: body.locale },
            { theme: body.theme, themeOverrides: body.themeOverrides },
          );
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('X-Paperwright-Warnings', encodeURIComponent(JSON.stringify(result.warnings)));
          res.setHeader('X-Render-Ms', String(Math.round(performance.now() - started)));
          res.end(Buffer.from(result.bytes));
        } catch (error) {
          json(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}
