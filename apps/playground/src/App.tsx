import { useCallback, useEffect, useRef, useState } from 'react';
import { PdfPages } from './PdfPages';
import { requestRender } from './render-client';

interface Examples {
  names: string[];
  examples: Record<string, { template: unknown; data: unknown }>;
}

import type { Issue } from './render-client';

const pretty = (value: unknown) => JSON.stringify(value, null, 2);

const parse = (text: string): { value: unknown; error?: string } => {
  try {
    return { value: JSON.parse(text) };
  } catch (e) {
    return { value: undefined, error: e instanceof Error ? e.message : String(e) };
  }
};

export function App() {
  const [examples, setExamples] = useState<Examples | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [templateText, setTemplateText] = useState('');
  const [dataText, setDataText] = useState('');
  const [pdf, setPdf] = useState<ArrayBuffer | null>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean }>({ text: 'loading examples…' });
  const [issues, setIssues] = useState<Issue[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [parseErrors, setParseErrors] = useState<{ template?: string; data?: string }>({});
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch('/api/examples')
      .then((r) => r.json() as Promise<Examples>)
      .then((ex) => {
        setExamples(ex);
        const first = ex.names.includes('invoice') ? 'invoice' : ex.names[0];
        if (first) load(ex, first);
      })
      .catch((e) => setStatus({ text: `could not load examples: ${e}`, error: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = (ex: Examples, name: string) => {
    const example = ex.examples[name];
    if (!example) return;
    setSelected(name);
    setTemplateText(pretty(example.template));
    setDataText(pretty(example.data));
  };

  const render = useCallback(async (template: string, data: string) => {
    const t = parse(template);
    const d = parse(data);
    setParseErrors({ template: t.error, data: d.error });
    if (t.error || d.error) {
      setStatus({ text: 'fix the JSON to render', error: true });
      return;
    }
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setStatus({ text: 'rendering…' });
    try {
      const outcome = await requestRender({ model: t.value, data: d.value }, controller.signal);
      if (!outcome.ok) {
        setIssues(outcome.issues);
        setWarnings([]);
        setStatus({ text: 'template is invalid or the render failed', error: true });
        return;
      }
      setPdf(outcome.bytes);
      setIssues([]);
      setWarnings(outcome.warnings);
      setStatus({ text: `${Math.round(outcome.bytes.byteLength / 1024)} KB in ${outcome.renderMs} ms` });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setStatus({ text: `render failed: ${e}`, error: true });
    }
  }, []);

  useEffect(() => {
    if (!templateText) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void render(templateText, dataText), 400);
    return () => window.clearTimeout(timer.current);
  }, [templateText, dataText, render]);

  return (
    <div className="app">
      <header className="bar">
        <h1>paperwright playground</h1>
        <select value={selected} onChange={(e) => examples && load(examples, e.target.value)} disabled={!examples}>
          {examples?.names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button onClick={() => examples && load(examples, selected)} disabled={!examples}>
          Reset
        </button>
        <button
          onClick={() => {
            if (!pdf) return;
            const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `${selected || 'document'}.pdf`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
          disabled={!pdf}
        >
          Download PDF
        </button>
        <span className={`status${status.error ? ' error' : ''}`}>{status.text}</span>
      </header>
      <div className="split">
        <div className="editors">
          <div className="editor">
            <label>Template (model JSON){parseErrors.template ? ` — ${parseErrors.template}` : ''}</label>
            <textarea className={parseErrors.template ? 'invalid' : ''} value={templateText} onChange={(e) => setTemplateText(e.target.value)} spellCheck={false} />
          </div>
          <div className="editor">
            <label>Data (JSON){parseErrors.data ? ` — ${parseErrors.data}` : ''}</label>
            <textarea className={parseErrors.data ? 'invalid' : ''} value={dataText} onChange={(e) => setDataText(e.target.value)} spellCheck={false} />
          </div>
        </div>
        <div className="preview">
          <div className="messages">
            {issues.length > 0 ? (
              <ul>
                {issues.map((i, k) => (
                  <li key={k} className="error">
                    {i.path ? <code>{i.path}</code> : null} {i.message}
                  </li>
                ))}
              </ul>
            ) : warnings.length > 0 ? (
              <ul>
                {warnings.map((w, k) => (
                  <li key={k} className="warn">
                    {w}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="ok">No issues. Edit the template or the data; the PDF re-renders as you type.</span>
            )}
          </div>
          {pdf ? <PdfPages bytes={pdf} /> : <div className="empty">Rendering…</div>}
        </div>
      </div>
    </div>
  );
}
