import type { DocumentModel, RenderData } from '@paperwright/model';
import type { FontFace } from '@paperwright/pdf';
import interBold from '@paperwright/pdf/fonts/Inter-Bold.ttf?url';
import interItalic from '@paperwright/pdf/fonts/Inter-Italic.ttf?url';
import interMedium from '@paperwright/pdf/fonts/Inter-Medium.ttf?url';
import interRegular from '@paperwright/pdf/fonts/Inter-Regular.ttf?url';
import interSemiBold from '@paperwright/pdf/fonts/Inter-SemiBold.ttf?url';
import type { RenderOutcome } from '../render-client';
import type { RenderJob, RenderReply } from './render.worker';

const FONT_FILES: { url: string; weight: FontFace['weight']; style: FontFace['style'] }[] = [
  { url: interRegular, weight: 400, style: 'normal' },
  { url: interItalic, weight: 400, style: 'italic' },
  { url: interMedium, weight: 500, style: 'normal' },
  { url: interSemiBold, weight: 600, style: 'normal' },
  { url: interBold, weight: 700, style: 'normal' },
];

/**
 * The in-browser renderer: a worker running the same renderPdf as the server. Fonts and image
 * bytes are fetched once and kept; each job sends copies (the worker keeps nothing between jobs).
 */
export class LocalRenderer {
  private worker: Worker | null = null;
  private fonts: Promise<FontFace[]> | null = null;
  private readonly images = new Map<string, Promise<Uint8Array>>();
  private readonly waiting = new Map<number, { resolve: (r: RenderReply) => void; reject: (e: Error) => void }>();
  private next = 1;
  private broken: string | null = null;

  /** Why the worker cannot be used, once it has failed; null while it works. */
  get unavailable() {
    return this.broken;
  }

  private start(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<RenderReply>) => {
      const job = this.waiting.get(event.data.id);
      if (!job) return;
      this.waiting.delete(event.data.id);
      job.resolve(event.data);
    };
    worker.onerror = (event) => {
      this.broken = event.message ? `${event.message} (${event.filename}:${event.lineno})` : 'the render worker failed to load';
      for (const job of this.waiting.values()) job.reject(new Error(this.broken));
      this.waiting.clear();
      worker.terminate();
      this.worker = null;
    };
    this.worker = worker;
    return worker;
  }

  private loadFonts(): Promise<FontFace[]> {
    this.fonts ??= Promise.all(
      FONT_FILES.map(async (f) => ({ family: 'Inter', weight: f.weight, style: f.style, data: new Uint8Array(await (await fetch(f.url)).arrayBuffer()) })),
    );
    return this.fonts;
  }

  private image(hash: string): Promise<Uint8Array> {
    let pending = this.images.get(hash);
    if (!pending) {
      pending = fetch(`/api/assets/${hash}`).then(async (r) => {
        if (!r.ok) throw new Error(`no bytes for asset ${hash}`);
        return new Uint8Array(await r.arrayBuffer());
      });
      this.images.set(hash, pending);
    }
    return pending;
  }

  async render(model: DocumentModel, data: RenderData, signal: AbortSignal): Promise<RenderOutcome & { where: 'browser' }> {
    if (this.broken) throw new Error(this.broken);
    const worker = this.start();
    const fonts = await this.loadFonts();
    const assets: [string, Uint8Array][] = [];
    for (const a of model.assets) {
      try {
        assets.push([a.hash, await this.image(a.hash)]);
      } catch {
        // The renderer reports a missing asset as a warning; nothing to do here.
      }
    }
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    const id = this.next++;
    const reply = await new Promise<RenderReply>((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      signal.addEventListener('abort', () => {
        this.waiting.delete(id);
        reject(new DOMException('aborted', 'AbortError'));
      });
      const job: RenderJob = { id, model, data, assets: assets.map(([h, b]) => [h, new Uint8Array(b)]), fonts: fonts.map((f) => ({ ...f, data: new Uint8Array(f.data) })) };
      worker.postMessage(job, [...job.assets.map(([, b]) => b.buffer), ...job.fonts.map((f) => f.data.buffer)]);
    });
    if (!reply.ok) throw new Error(reply.error);
    return { ok: true, bytes: reply.bytes, warnings: reply.warnings, renderMs: reply.ms, where: 'browser' };
  }
}
