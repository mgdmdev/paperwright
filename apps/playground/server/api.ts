import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { validateModel } from '@paperwright/model';
import type { RenderData } from '@paperwright/model';
import { renderPdf, themePresets } from '@paperwright/pdf';
import type { ThemeOverrides } from '@paperwright/pdf';

/**
 * The playground's API, served by the Vite dev server itself so there is one process to run.
 * GET  /api/examples      → the example templates and data, and the assets as { hash, mime }
 * GET  /api/themes        → the built-in theme presets, for canvas previews
 * GET  /api/assets/<hash> → an example image by content hash
 * POST /api/render        → { model, data, theme?, themeOverrides?, locale? }
 *                           → { pdf: base64, warnings, renderMs }, or 400 { issues } / { error }
 * Assets are the example images, keyed by the same content hash the templates use.
 */
export type AssetMime = 'image/png' | 'image/jpeg';

export function playgroundApi(examplesDir: string): Plugin {
  const assets = new Map<string, { bytes: Uint8Array; mime: AssetMime }>();

  const loadAssets = async () => {
    for (const file of await readdir(path.join(examplesDir, 'assets'))) {
      if (!/\.(png|jpe?g)$/i.test(file)) continue;
      const bytes = new Uint8Array(await readFile(path.join(examplesDir, 'assets', file)));
      const mime: AssetMime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
      assets.set(createHash('sha256').update(bytes).digest('hex').slice(0, 16), { bytes, mime });
    }
  };

  /** A rejected async handler must answer, not take the dev server down as an unhandled rejection. */
  const safe =
    (handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void) =>
    (req: IncomingMessage, res: ServerResponse) => {
      Promise.resolve()
        .then(() => handler(req, res))
        .catch((error: unknown) => {
          if (!res.headersSent) json(res, 500, { error: error instanceof Error ? error.message : String(error) });
          else res.end();
        });
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
      server.middlewares.use('/api/examples', safe(async (_req, res) => {
        const names = (await readdir(path.join(examplesDir, 'templates'))).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
        const examples: Record<string, { template: unknown; data: unknown }> = {};
        for (const name of names) {
          examples[name] = {
            template: JSON.parse(await readFile(path.join(examplesDir, `templates/${name}.json`), 'utf8')),
            data: JSON.parse(await readFile(path.join(examplesDir, `data/${name}.json`), 'utf8')),
          };
        }
        json(res, 200, { names, examples, assets: [...assets].map(([hash, a]) => ({ hash, mime: a.mime })) });
      }));
      server.middlewares.use('/api/themes', safe((_req, res) => json(res, 200, themePresets)));
      server.middlewares.use('/api/assets', safe((req, res) => {
        const hash = (req.url ?? '').replace(/^\//, '').split('?')[0] ?? '';
        const asset = assets.get(hash);
        if (!asset) return json(res, 404, { error: `no asset ${hash}` });
        res.statusCode = 200;
        res.setHeader('Content-Type', asset.mime);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.end(Buffer.from(asset.bytes));
      }));
      server.middlewares.use('/api/render', safe(async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
        let raw: unknown;
        try {
          raw = await readJson(req);
        } catch {
          return json(res, 400, { error: 'Body is not JSON' });
        }
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return json(res, 400, { error: 'Body must be a JSON object' });
        const body = raw as { model?: unknown; data?: RenderData; theme?: string; themeOverrides?: ThemeOverrides; locale?: string };
        const validated = validateModel(body.model);
        if (!validated.ok) return json(res, 400, { issues: validated.issues });
        const bytesByHash = new Map([...assets].map(([hash, a]) => [hash, a.bytes]));
        try {
          const started = performance.now();
          const result = await renderPdf(
            { model: validated.model, data: body.data ?? {}, assets: bytesByHash, locale: body.locale },
            { theme: body.theme, themeOverrides: body.themeOverrides },
          );
          json(res, 200, { pdf: Buffer.from(result.bytes).toString('base64'), warnings: result.warnings, renderMs: Math.round(performance.now() - started) });
        } catch (error) {
          json(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      }));
    },
  };
}
