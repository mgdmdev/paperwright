import { Puck, blocksPlugin, fieldsPlugin, outlinePlugin } from '@puckeditor/core';
import type { Plugin } from '@puckeditor/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { migrateModel } from '@paperwright/model';
import type { DocumentModel } from '@paperwright/model';
import { AiDialog } from './AiDialog';
import { assetStore, useAssets } from './assets';
import { createConfig } from './config';
import type { CanvasMetadata } from './config';
import { describeDiff, diffTemplates } from '@paperwright/ai';
import { blankModel, library } from './library';
import type { LibraryEntry } from './library';
import { chooseStore } from './store';
import type { TemplateStore } from './store';
import { PreviewPanel } from './panel/PreviewPanel';
import type { ComposerData } from './puck';
import { dataToModel, modelToData } from './transform';

interface Examples {
  names: string[];
  examples: Record<string, { template: unknown; data: unknown }>;
  assets: { hash: string; mime: 'image/png' | 'image/jpeg' }[];
}

/** What the canvas is editing: an example (read-only until touched) or an entry of the library. */
interface Current {
  id: string;
  name: string;
  source: 'example' | 'mine';
}

/** The sample data typed on the page: JSON when it parses, the raw text otherwise. */
const sampleOf = (d: ComposerData): unknown => {
  const text = String(d.root.props?.sampleData || '{}');
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/** What a failed action says in the notice. */
const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w.-]+/g, '-').toLowerCase() || 'template'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function App() {
  const [examples, setExamples] = useState<Examples | null>(null);
  const [themes, setThemes] = useState<CanvasMetadata['themes'] | null>(null);
  const [current, setCurrent] = useState<Current | null>(null);
  const [data, setData] = useState<ComposerData | null>(null);
  const [store, setStore] = useState<TemplateStore | null>(null);
  const [mine, setMine] = useState<LibraryEntry[]>([]);
  const [key, setKey] = useState(0);
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const assets = useAssets();
  const fileInput = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  /** The save that is waiting for the debounce, with the template it was scheduled for. */
  const pending = useRef<{ c: Current; d: ComposerData } | null>(null);
  const latest = useRef<ComposerData | null>(null);
  /** Saves on their way to the store, by template id, so a delete lets them land first. */
  const inFlight = useRef(new Map<string, Promise<unknown>>());
  const listSeq = useRef(0);

  useEffect(() => {
    const load = async <T,>(url: string): Promise<T> => {
      const r = await fetch(url);
      const body = (await r.json().catch(() => null)) as (T & { error?: string }) | null;
      if (!r.ok) throw new Error(body?.error ?? `${url} answered ${r.status}`);
      return body as T;
    };
    (async () => {
      try {
        const [ex, th, st] = await Promise.all([load<Examples>('/api/examples'), load<CanvasMetadata['themes']>('/api/themes'), chooseStore()]);
        setExamples(ex);
        setThemes(th);
        setStore(st);
        assetStore.set(ex.assets);
        const entries = await st.list();
        setMine(entries);
        const last = entries[0];
        if (last) openMine(last);
        else openExample(ex, ex.names.includes('invoice') ? 'invoice' : ex.names[0]!);
      } catch (e) {
        setLoadError(reason(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Lists can answer out of order; only the newest request may set the sidebar. */
  const refresh = async (st: TemplateStore) => {
    const seq = ++listSeq.current;
    const entries = await st.list();
    if (seq === listSeq.current) setMine(entries);
  };

  /** Header actions report a failure in the notice instead of dying as unhandled rejections. */
  const run = (what: string, action: () => Promise<void>) => {
    action().catch((e: unknown) => setNotice(`Could not ${what}: ${reason(e)}`));
  };

  const mount = (c: Current, model: DocumentModel, sampleData: unknown) => {
    // A save still waiting for the previous template must not fire against this one.
    window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    pending.current = null;
    setCurrent(c);
    setData(modelToData(model, sampleData));
    latest.current = null;
    setKey((k) => k + 1);
  };

  const openExample = (ex: Examples, name: string) => {
    const example = ex.examples[name];
    if (!example) return;
    mount({ id: name, name, source: 'example' }, migrateModel(example.template), example.data);
    setNotice('');
  };

  const openMine = (entry: LibraryEntry) => {
    mount({ id: entry.id, name: entry.name, source: 'mine' }, entry.model, entry.sampleData);
    setNotice('');
  };

  const persist = useCallback(
    async (c: Current, d: ComposerData) => {
      if (!store) throw new Error('no store yet');
      const model = dataToModel(d, assetStore.get(), c.id);
      const job = store.save({ id: c.id, name: model.name, model, sampleData: sampleOf(d) });
      inFlight.current.set(c.id, job);
      try {
        const saved = await job;
        await refresh(store);
        return saved;
      } finally {
        if (inFlight.current.get(c.id) === job) inFlight.current.delete(c.id);
      }
    },
    [store],
  );

  /** Edits to an example fork it into the library; edits to a library entry save in place. */
  const onChange = (d: ComposerData) => {
    latest.current = d;
    if (!current) return;
    if (current.source === 'example') {
      const forked: Current = { id: library.newId(), name: current.name, source: 'mine' };
      setCurrent(forked);
      void persist(forked, d).then(() => setNotice(`Saved as your own copy of "${current.name}" in ${store?.name ?? 'this browser'}`), (e) => setNotice(`Could not save: ${reason(e)}`));
      return;
    }
    pending.current = { c: current, d };
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const job = pending.current;
      pending.current = null;
      if (!job) return;
      void persist(job.c, job.d).then(
        (saved) => setCurrent((now) => (now && now.id === job.c.id && now.name !== saved.name ? { ...now, name: saved.name } : now)),
        (e) => setNotice(`Could not save: ${reason(e)}`),
      );
    }, 800);
  };

  const newBlank = async () => {
    if (!store) return;
    const id = library.newId();
    const model = blankModel(id);
    await store.save({ id, name: model.name, model, sampleData: {} });
    await refresh(store);
    mount({ id, name: model.name, source: 'mine' }, model, {});
  };

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { template?: unknown; data?: unknown } | Record<string, unknown>;
      const raw = 'template' in parsed && parsed.template ? parsed.template : parsed;
      const sampleData = 'data' in parsed && parsed.template ? parsed.data : {};
      const model = migrateModel(raw);
      const id = library.newId();
      if (!store) return;
      await store.save({ id, name: model.name, model, sampleData });
      await refresh(store);
      mount({ id, name: model.name, source: 'mine' }, model, sampleData);
      setNotice(`Opened ${file.name}`);
    } catch (e) {
      setNotice(`Could not open ${file.name}: ${reason(e)}`);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const duplicate = async () => {
    if (!current) return;
    const d = latest.current ?? data;
    if (!d) return;
    const id = library.newId();
    const entry = await persist({ id, name: `${current.name} (copy)`, source: 'mine' }, { ...d, root: { ...d.root, props: { ...d.root.props!, name: `${current.name} (copy)` } } });
    openMine(entry);
  };

  const remove = async () => {
    if (!current || current.source !== 'mine' || !store) return;
    window.clearTimeout(saveTimer.current);
    pending.current = null;
    // A save already on its way would recreate the template after the delete; let it land first.
    await inFlight.current.get(current.id)?.catch(() => undefined);
    await store.remove(current.id);
    listSeq.current++;
    const entries = await store.list();
    setMine(entries);
    const next = entries[0];
    if (next) openMine(next);
    else if (examples) openExample(examples, examples.names[0]!);
  };

  /** A generated or rewritten template lands in the library as its own entry, with what changed. */
  const adopt = async (model: DocumentModel, sampleData: unknown, note: string) => {
    if (!store) return;
    const before = currentForAi()?.model;
    const id = library.newId();
    await store.save({ id, name: model.name, model: { ...model, id }, sampleData: sampleData ?? {} });
    await refresh(store);
    mount({ id, name: model.name, source: 'mine' }, { ...model, id }, sampleData ?? {});
    setNotice(before && note.startsWith('Edited') ? `${note}: ${describeDiff(diffTemplates(before, model))}` : note);
  };

  const currentForAi = () => {
    const d = latest.current ?? data;
    if (!d || !current) return null;
    const sample = sampleOf(d);
    return { model: dataToModel(d, assetStore.get(), current.id), sampleData: typeof sample === 'string' ? {} : sample };
  };

  const hashes = useMemo(() => assets.map((a) => a.hash), [assets]);
  const metadata = useMemo<CanvasMetadata>(() => ({ themes: themes ?? {}, assets: hashes }), [themes, hashes]);
  const config = useMemo(() => createConfig(), []);
  const plugins = useMemo<Plugin[]>(
    () => [
      blocksPlugin(),
      outlinePlugin(),
      fieldsPlugin({ desktopSideBar: 'right' }),
      { name: 'paperwright-preview', label: 'PDF', icon: <span style={{ fontWeight: 700, fontSize: 11 }}>PDF</span>, render: () => <PreviewPanel /> },
    ],
    [],
  );

  if (loadError) {
    return (
      <div className="pw-loading">
        Could not start the composer: {loadError}{' '}
        <button type="button" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }
  if (!data || !examples || !themes || !current) return <div className="pw-loading">Loading…</div>;

  return (
    <>
    <AiDialog open={aiOpen} onClose={() => setAiOpen(false)} current={currentForAi()} onGenerated={adopt} />
    <Puck
      key={key}
      config={config}
      data={data}
      metadata={metadata}
      plugins={plugins}
      iframe={{ enabled: false }}
      headerTitle={`${current.name}${current.source === 'example' ? ' (example)' : ''}`}
      onChange={onChange}
      onPublish={(d) => download(current.name, JSON.stringify({ template: dataToModel(d, assetStore.get(), current.id), data: sampleOf(d) }, null, 2))}
      overrides={{
        headerActions: ({ children }) => (
          <>
            <div className="pw-header-actions">
              <select
                value={`${current.source}:${current.id}`}
                onChange={(e) => {
                  const [source, ...rest] = e.target.value.split(':');
                  const id = rest.join(':');
                  if (source === 'example') openExample(examples, id);
                  else
                    run('open the template', async () => {
                      const entry = store ? await store.get(id) : undefined;
                      if (!entry) {
                        if (store) await refresh(store);
                        throw new Error('it is no longer in the store');
                      }
                      openMine(entry);
                    });
                }}
              >
                <optgroup label={`My templates (${store?.name ?? '…'})`}>
                  {mine.length === 0 ? <option disabled>none yet</option> : null}
                  {mine.map((t) => (
                    <option key={t.id} value={`mine:${t.id}`}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Examples">
                  {examples.names.map((n) => (
                    <option key={n} value={`example:${n}`}>
                      {n}
                    </option>
                  ))}
                </optgroup>
              </select>
              <button type="button" onClick={() => run('create a template', newBlank)}>New</button>
              <button type="button" onClick={() => fileInput.current?.click()}>Open…</button>
              <button type="button" onClick={() => run('duplicate it', duplicate)}>Duplicate</button>
              <button type="button" onClick={() => setAiOpen(true)}>AI…</button>
              {current.source === 'mine' ? (
                <button type="button" className="pw-danger" onClick={() => run('delete it', remove)}>Delete</button>
              ) : null}
              <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => void openFile(e.currentTarget.files?.[0])} />
              {notice ? <span className="pw-notice">{notice}</span> : null}
            </div>
            {children}
          </>
        ),
      }}
    />
    </>
  );
}
