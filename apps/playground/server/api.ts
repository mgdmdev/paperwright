import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { validateModel } from '@paperwright/model';
import type { RenderData } from '@paperwright/model';
import { renderPdf, themePresets } from '@paperwright/pdf';
import type { ThemeOverrides } from '@paperwright/pdf';
import { editTemplate, gemini, generateTemplate, openAiCompatible, suggestSampleData, GenerationError } from '@paperwright/ai';
import type { AssetHint, LlmClient } from '@paperwright/ai';

/**
 * The playground's API, served by the Vite dev server itself so there is one process to run.
 * GET  /api/examples      → the example templates and data, and the assets as { hash, mime }
 * GET  /api/themes        → the built-in theme presets, for canvas previews
 * GET  /api/assets/<hash> → an image by content hash
 * POST /api/assets        → { name, mime, base64 } → { hash, mime }; stored under uploadsDir
 * POST /api/render        → { model, data, theme?, themeOverrides?, locale? }
 *                           → { pdf: base64, warnings, renderMs }, or 400 { issues } / { error }
 * GET  /api/ai            → { configured, client }
 * POST /api/ai/template   → { prompt, sampleData?, locale?, assets? } → { model, sampleData, attempts }
 * POST /api/ai/edit       → { model, instruction, sampleData? } → { model, attempts }
 * POST /api/ai/sample     → { model, hint? } → { data, attempts, unresolved }
 * The language model comes from the environment: PAPERWRIGHT_AI_PROVIDER (gemini | openai),
 * PAPERWRIGHT_AI_KEY, PAPERWRIGHT_AI_MODEL, PAPERWRIGHT_AI_BASE_URL.
 * Assets are the example images plus uploads, keyed by the content hash the templates use.
 */
export type AssetMime = 'image/png' | 'image/jpeg';

const hashOf = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

/** The bytes decide the type; a declared mime is not trusted. */
const sniffMime = (bytes: Uint8Array): AssetMime | null => {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
};

const MAX_UPLOAD = 5 * 1024 * 1024;

const aiClient = (): LlmClient | null => {
  const provider = process.env.PAPERWRIGHT_AI_PROVIDER;
  const apiKey = process.env.PAPERWRIGHT_AI_KEY;
  const model = process.env.PAPERWRIGHT_AI_MODEL;
  if (!provider || !apiKey) return null;
  if (provider === 'gemini') return gemini({ apiKey, model: model || undefined });
  if (provider === 'openai') return openAiCompatible({ apiKey, model: model || 'gpt-4o-mini', baseUrl: process.env.PAPERWRIGHT_AI_BASE_URL || undefined });
  return null;
};

export function playgroundApi(examplesDir: string, uploadsDir: string): Plugin {
  const assets = new Map<string, { bytes: Uint8Array; mime: AssetMime }>();

  const loadDir = async (dir: string) => {
    let files: string[] = [];
    try {
      files = await readdir(dir);
    } catch {
      return;
    }
    for (const file of files) {
      if (!/\.(png|jpe?g)$/i.test(file)) continue;
      const bytes = new Uint8Array(await readFile(path.join(dir, file)));
      const mime = sniffMime(bytes);
      if (mime) assets.set(hashOf(bytes), { bytes, mime });
    }
  };
  const loadAssets = async () => {
    await loadDir(path.join(examplesDir, 'assets'));
    await loadDir(uploadsDir);
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
      server.middlewares.use('/api/assets', safe(async (req, res) => {
        if (req.method === 'POST') {
          let raw: unknown;
          try {
            raw = await readJson(req);
          } catch {
            return json(res, 400, { error: 'Body is not JSON' });
          }
          const body = (typeof raw === 'object' && raw !== null ? raw : {}) as { base64?: unknown };
          if (typeof body.base64 !== 'string') return json(res, 400, { error: 'Expected { base64 }' });
          const bytes = new Uint8Array(Buffer.from(body.base64, 'base64'));
          if (bytes.length === 0 || bytes.length > MAX_UPLOAD) return json(res, 400, { error: `Image must be between 1 byte and ${MAX_UPLOAD / 1024 / 1024} MB` });
          const mime = sniffMime(bytes);
          if (!mime) return json(res, 400, { error: 'Only PNG and JPEG images are accepted' });
          const hash = hashOf(bytes);
          if (!assets.has(hash)) {
            await mkdir(uploadsDir, { recursive: true });
            await writeFile(path.join(uploadsDir, `${hash}.${mime === 'image/png' ? 'png' : 'jpg'}`), bytes);
            assets.set(hash, { bytes, mime });
          }
          return json(res, 200, { hash, mime });
        }
        const hash = (req.url ?? '').replace(/^\//, '').split('?')[0] ?? '';
        const asset = assets.get(hash);
        if (!asset) return json(res, 404, { error: `no asset ${hash}` });
        res.statusCode = 200;
        res.setHeader('Content-Type', asset.mime);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.end(Buffer.from(asset.bytes));
      }));
      const readObject = async (req: IncomingMessage, res: ServerResponse): Promise<Record<string, unknown> | null> => {
        let raw: unknown;
        try {
          raw = await readJson(req);
        } catch {
          json(res, 400, { error: 'Body is not JSON' });
          return null;
        }
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
          json(res, 400, { error: 'Body must be a JSON object' });
          return null;
        }
        return raw as Record<string, unknown>;
      };
      const withAi = async (req: IncomingMessage, res: ServerResponse, run: (client: LlmClient, body: Record<string, unknown>) => Promise<unknown>) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
        const client = aiClient();
        if (!client) return json(res, 503, { error: 'No language model configured: set PAPERWRIGHT_AI_PROVIDER, PAPERWRIGHT_AI_KEY and PAPERWRIGHT_AI_MODEL' });
        const body = await readObject(req, res);
        if (!body) return;
        try {
          json(res, 200, await run(client, body));
        } catch (error) {
          if (error instanceof GenerationError) return json(res, 422, { error: error.message, repairs: error.repairs, lastAnswer: error.lastAnswer.slice(0, 4000) });
          json(res, 502, { error: error instanceof Error ? error.message : String(error) });
        }
      };
      server.middlewares.use('/api/ai/template', safe((req, res) =>
        withAi(req, res, async (client, body) => {
          const sampleData = (typeof body.sampleData === 'object' && body.sampleData !== null ? body.sampleData : undefined) as RenderData | undefined;
          const hints = (Array.isArray(body.assets) ? body.assets : []) as AssetHint[];
          const result = await generateTemplate({ client, prompt: String(body.prompt ?? ''), sampleData, locale: typeof body.locale === 'string' ? body.locale : undefined, assets: hints.filter((h) => assets.has(h.hash)) });
          const data = sampleData && Object.keys(sampleData).length ? { data: sampleData, attempts: 0, unresolved: [] } : await suggestSampleData({ client, model: result.model });
          return { model: result.model, sampleData: data.data, attempts: result.attempts, dataAttempts: data.attempts, unresolved: data.unresolved };
        }),
      ));
      server.middlewares.use('/api/ai/edit', safe((req, res) =>
        withAi(req, res, async (client, body) => {
          const current = validateModel(body.model);
          if (!current.ok) throw new Error(`The current template is invalid: ${current.issues[0]?.message ?? ''}`);
          const sampleData = (typeof body.sampleData === 'object' && body.sampleData !== null ? body.sampleData : undefined) as RenderData | undefined;
          const known = [...assets].map(([hash, a]) => ({ hash, mime: a.mime, description: 'an image already in this template' }));
          const result = await editTemplate({ client, model: current.model, instruction: String(body.instruction ?? ''), sampleData, assets: known });
          return { model: result.model, attempts: result.attempts };
        }),
      ));
      server.middlewares.use('/api/ai/sample', safe((req, res) =>
        withAi(req, res, async (client, body) => {
          const current = validateModel(body.model);
          if (!current.ok) throw new Error(`The template is invalid: ${current.issues[0]?.message ?? ''}`);
          return suggestSampleData({ client, model: current.model, hint: typeof body.hint === 'string' ? body.hint : undefined });
        }),
      ));
      server.middlewares.use('/api/ai', safe((_req, res) => {
        const client = aiClient();
        json(res, 200, { configured: !!client, client: client?.name ?? null });
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
