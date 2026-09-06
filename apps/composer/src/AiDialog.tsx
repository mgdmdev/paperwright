import { useEffect, useRef, useState } from 'react';
import type { DocumentModel } from '@paperwright/model';

interface Props {
  open: boolean;
  onClose: () => void;
  /** The template on the canvas, for the edit mode. */
  current: { model: DocumentModel; sampleData: unknown } | null;
  onGenerated: (model: DocumentModel, sampleData: unknown, note: string) => void;
}

type Mode = 'new' | 'edit';

/** "Describe the document" and "change this template", both through the dev API's language model. */
export function AiDialog({ open, onClose, current, onGenerated }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>('new');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<{ configured: boolean; client: string | null } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      fetch('/api/ai').then((r) => r.json()).then(setConfigured).catch(() => setConfigured({ configured: false, client: null }));
    }
    if (!open && el.open) el.close();
  }, [open]);

  const run = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = mode === 'new'
        ? await fetch('/api/ai/template', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: text }) })
        : await fetch('/api/ai/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: current?.model, instruction: text, sampleData: current?.sampleData }) });
      const body = (await res.json()) as { model?: DocumentModel; sampleData?: unknown; attempts?: number; error?: string; repairs?: unknown[] };
      if (!res.ok || !body.model) {
        setError(body.error ? `${body.error}${body.repairs ? ` (after ${body.repairs.length} repair rounds)` : ''}` : `failed (${res.status})`);
        return;
      }
      onGenerated(body.model, mode === 'new' ? body.sampleData : current?.sampleData, `${mode === 'new' ? 'Generated' : 'Edited'} in ${body.attempts} round${body.attempts === 1 ? '' : 's'}`);
      setText('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="pw-dialog" onClose={onClose}>
      <div className="pw-dialog-head">
        <button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}>New from a description</button>
        <button type="button" className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')} disabled={!current}>Change this template</button>
      </div>
      {configured && !configured.configured ? (
        <p className="pw-dialog-warn">No language model is configured. Start the dev server with PAPERWRIGHT_AI_PROVIDER, PAPERWRIGHT_AI_KEY and PAPERWRIGHT_AI_MODEL set.</p>
      ) : null}
      <textarea
        value={text}
        rows={6}
        placeholder={mode === 'new' ? 'An employment offer letter for a Ghanaian company: salary package as a table, start date, two signatures, a confidentiality note in the footer.' : 'Move the totals under the table and make the invoice number red.'}
        onChange={(e) => setText(e.currentTarget.value)}
        disabled={busy}
      />
      {error ? <div className="pw-field-error">{error}</div> : null}
      <div className="pw-dialog-actions">
        <span className="pw-muted pw-small">{configured?.client ? `via ${configured.client}` : ''}</span>
        <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="primary" onClick={() => void run()} disabled={busy || !text.trim() || configured?.configured === false}>
          {busy ? 'Working…' : mode === 'new' ? 'Generate' : 'Apply'}
        </button>
      </div>
    </dialog>
  );
}
