/** Calls the dev API's render route and hands back bytes, warnings and timing, or the issues. */
export interface Issue {
  path: string;
  message: string;
}

export type RenderOutcome = { ok: true; bytes: ArrayBuffer; warnings: string[]; renderMs: number } | { ok: false; issues: Issue[] };

const fromBase64 = (b64: string): ArrayBuffer => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

export async function requestRender(body: unknown, signal: AbortSignal): Promise<RenderOutcome> {
  const res = await fetch('/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const payload = (await res.json()) as { pdf?: string; warnings?: string[]; renderMs?: number; issues?: Issue[]; error?: string };
  if (!res.ok || !payload.pdf) {
    return { ok: false, issues: payload.issues ?? [{ path: '', message: payload.error ?? `render failed (${res.status})` }] };
  }
  return { ok: true, bytes: fromBase64(payload.pdf), warnings: payload.warnings ?? [], renderMs: payload.renderMs ?? 0 };
}
