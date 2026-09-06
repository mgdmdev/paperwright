import { useEffect, useRef, useState } from 'react';
import { validateModel } from '@paperwright/model';
import { PdfPages } from '../PdfPages';
import { usePuckStore } from '../puck';
import { dataToModel } from '../transform';

interface Issue {
  path: string;
  message: string;
}

/**
 * The plugin panel: what the current canvas renders to, as a real PDF, plus the issues and
 * warnings the model and renderer report. Re-renders after edits settle.
 */
export function PreviewPanel({ assets }: { assets: string[] }) {
  const data = usePuckStore((s) => s.appState.data);
  const [pdf, setPdf] = useState<ArrayBuffer | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      let model;
      try {
        model = dataToModel(data, assets.map((hash) => ({ hash, mime: 'image/png' as const })));
      } catch (e) {
        setIssues([{ path: '', message: e instanceof Error ? e.message : String(e) }]);
        return;
      }
      const validated = validateModel(model);
      if (!validated.ok) {
        setIssues(validated.issues);
        setStatus('template is invalid');
        return;
      }
      let sample: unknown = {};
      try {
        sample = JSON.parse(String(data.root.props?.sampleData || '{}'));
      } catch (e) {
        setIssues([{ path: 'sample data', message: e instanceof Error ? e.message : String(e) }]);
        setStatus('sample data is not JSON');
        return;
      }
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      setStatus('rendering…');
      try {
        const res = await fetch('/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, data: sample }), signal: controller.signal });
        if (!res.ok) {
          const body = (await res.json()) as { issues?: Issue[]; error?: string };
          setIssues(body.issues ?? [{ path: '', message: body.error ?? `render failed (${res.status})` }]);
          setStatus('render failed');
          return;
        }
        const bytes = await res.arrayBuffer();
        setPdf(bytes);
        setIssues([]);
        setWarnings(JSON.parse(decodeURIComponent(res.headers.get('X-Paperwright-Warnings') ?? '%5B%5D')) as string[]);
        setStatus(`${Math.round(bytes.byteLength / 1024)} KB in ${res.headers.get('X-Render-Ms')} ms`);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setStatus(`render failed: ${e}`);
      }
    }, 600);
    return () => window.clearTimeout(timer.current);
  }, [data, assets]);

  return (
    <div className="pw-panel">
      <div className="pw-panel-status">{status}</div>
      {issues.length > 0 ? (
        <ul className="pw-panel-issues">{issues.map((i, k) => <li key={k}>{i.path ? <code>{i.path}</code> : null} {i.message}</li>)}</ul>
      ) : warnings.length > 0 ? (
        <ul className="pw-panel-warnings">{warnings.map((w, k) => <li key={k}>{w}</li>)}</ul>
      ) : null}
      <div className="pw-panel-pages">{pdf ? <PdfPages bytes={pdf} /> : <div className="pw-muted">The PDF appears here.</div>}</div>
    </div>
  );
}
