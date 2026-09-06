import { useEffect, useRef, useState } from 'react';
import { validateModel } from '@paperwright/model';
import { PdfPages } from '../PdfPages';
import { usePuckStore } from '../puck';
import { requestRender } from '../render-client';
import type { Issue } from '../render-client';
import { dataToModel } from '../transform';

export interface AssetRef {
  hash: string;
  mime: 'image/png' | 'image/jpeg';
}

/** Puck mounts every plugin panel; only render while ours is the open one. */
const isOpen = (ui: { leftSideBarVisible: boolean; plugin: { current: string | null } }) =>
  ui.leftSideBarVisible && ui.plugin.current === 'paperwright-preview';

/**
 * The plugin panel: what the current canvas renders to, as a real PDF, plus the issues and
 * warnings the model and renderer report. Re-renders after edits settle, while the panel is open.
 */
export function PreviewPanel({ assets }: { assets: AssetRef[] }) {
  const data = usePuckStore((s) => s.appState.data);
  const open = usePuckStore((s) => isOpen(s.appState.ui));
  const [pdf, setPdf] = useState<ArrayBuffer | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      // Whatever was in flight answers an older canvas; it must not land after this pass.
      inFlight.current?.abort();
      inFlight.current = null;
      let model;
      try {
        model = dataToModel(data, assets);
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
      const controller = new AbortController();
      inFlight.current = controller;
      setStatus('rendering…');
      try {
        const outcome = await requestRender({ model, data: sample }, controller.signal);
        if (controller.signal.aborted) return;
        if (!outcome.ok) {
          setIssues(outcome.issues);
          setStatus('render failed');
          return;
        }
        setPdf(outcome.bytes);
        setIssues([]);
        setWarnings(outcome.warnings);
        setStatus(`${Math.round(outcome.bytes.byteLength / 1024)} KB in ${outcome.renderMs} ms`);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setStatus(`render failed: ${e}`);
      }
    }, 600);
    return () => window.clearTimeout(timer.current);
  }, [data, assets, open]);

  return (
    <div className="pw-panel">
      <div className="pw-panel-status">{status}</div>
      <div className="pw-panel-messages">
        {issues.length > 0 ? (
          <ul className="pw-panel-issues">{issues.map((i, k) => <li key={k}>{i.path ? <code>{i.path}</code> : null} {i.message}</li>)}</ul>
        ) : warnings.length > 0 ? (
          <ul className="pw-panel-warnings">{warnings.map((w, k) => <li key={k}>{w}</li>)}</ul>
        ) : null}
      </div>
      <div className="pw-panel-pages">{pdf ? <PdfPages bytes={pdf} /> : <div className="pw-muted">The PDF appears here.</div>}</div>
    </div>
  );
}
