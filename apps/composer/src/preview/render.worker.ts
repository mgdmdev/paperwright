/// <reference lib="webworker" />
import { init } from '@formepdf/core';
import wasmUrl from '@formepdf/core/pkg-web/forme_bg.wasm?url';
import type { DocumentModel, RenderData } from '@paperwright/model';
import { renderPdf } from '@paperwright/pdf';
import type { FontFace } from '@paperwright/pdf';

/**
 * Renders in the page's own process: no server round trip, and the same renderer the server
 * uses. Forme's worker build wants its WebAssembly module handed over once; after that every
 * job is a plain renderPdf call.
 */
export interface RenderJob {
  id: number;
  model: DocumentModel;
  data: RenderData;
  assets: [string, Uint8Array][];
  fonts: FontFace[];
}

export type RenderReply = { id: number; ok: true; bytes: ArrayBuffer; warnings: string[]; ms: number } | { id: number; ok: false; error: string };

let ready: Promise<void> | undefined;
const ensure = () =>
  (ready ??= (async () => {
    const module = await WebAssembly.compileStreaming(fetch(wasmUrl));
    await init(module);
  })());

self.onmessage = async (event: MessageEvent<RenderJob>) => {
  const job = event.data;
  const started = performance.now();
  try {
    await ensure();
    const result = await renderPdf({ model: job.model, data: job.data, assets: new Map(job.assets) }, { fonts: job.fonts });
    const bytes = result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength) as ArrayBuffer;
    const reply: RenderReply = { id: job.id, ok: true, bytes, warnings: result.warnings, ms: Math.round(performance.now() - started) };
    self.postMessage(reply, [bytes]);
  } catch (error) {
    const reply: RenderReply = { id: job.id, ok: false, error: error instanceof Error ? error.message : String(error) };
    self.postMessage(reply);
  }
};
