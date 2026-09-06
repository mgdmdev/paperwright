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
  const [aiOpen, setAiOpen] = useState(false);
  const assets = useAssets();
  const fileInput = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  /** The save that is waiting for the debounce, with the template it was scheduled for. */
  const pending = useRef<{ c: Current; d: ComposerData } | null>(null);
  const latest = useRef<ComposerData | null>(null);

  useEffect(() => {
    Promise.all([fetch('/api/examples').then((r) => r.json() as Promise<Examples>), fetch('/api/themes').then((r) => r.json() as Promise<CanvasMetadata['themes']>), chooseStore()]).then(async ([ex, th, st]) => {
      setExamples(ex);
      setThemes(th);
      setStore(st);
      assetStore.set(ex.assets);
      const entries = await st.list();
      setMine(entries);
      const last = entries[0];
      if (last) openMine(last);
      else openExample(ex, ex.names.includes('invoice') ? 'invoice' : ex.names[0]!);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async (st: TemplateStore) => setMine(await st.list());

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
      let sampleData: unknown = {};
      try {
        sampleData = JSON.parse(String(d.root.props?.sampleData || '{}'));
      } catch {
        sampleData = d.root.props?.sampleData ?? '{}';
      }
      const saved = await store.save({ id: c.id, name: model.name, model, sampleData });
      await refresh(store);
      return saved;
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
      void persist(forked, d).then(() => setNotice(`Saved as your own copy of "${current.name}" in ${store?.name ?? 'this browser'}`), (e) => setNotice(`Could not save: ${e instanceof Error ? e.message : String(e)}`));
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
        (e) => setNotice(`Could not save: ${e instanceof Error ? e.message : String(e)}`),
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
      setNotice(`Could not open ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
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
    await store.remove(current.id);
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
    let sampleData: unknown = {};
    try {
      sampleData = JSON.parse(String(d.root.props?.sampleData || '{}'));
    } catch {
      sampleData = {};
    }
    return { model: dataToModel(d, assetStore.get(), current.id), sampleData };
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
      onPublish={(d) => download(current.name, JSON.stringify(dataToModel(d, assetStore.get(), current.id), null, 2))}
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
                  else void store?.get(id).then((entry) => entry && openMine(entry));
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
              <button type="button" onClick={() => void newBlank()}>New</button>
              <button type="button" onClick={() => fileInput.current?.click()}>Open…</button>
              <button type="button" onClick={() => void duplicate()}>Duplicate</button>
              <button type="button" onClick={() => setAiOpen(true)}>AI…</button>
              {current.source === 'mine' ? (
                <button type="button" className="pw-danger" onClick={() => void remove()}>Delete</button>
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
