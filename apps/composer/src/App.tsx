import { Puck, blocksPlugin, fieldsPlugin, outlinePlugin } from '@puckeditor/core';
import type { Plugin } from '@puckeditor/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { migrateModel } from '@paperwright/model';
import type { DocumentModel } from '@paperwright/model';
import { AiDialog } from './AiDialog';
import { assetStore, useAssets } from './assets';
import { createConfig } from './config';
import type { CanvasMetadata } from './config';
import { blankModel, library } from './library';
import type { LibraryEntry } from './library';
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
  const [mine, setMine] = useState<LibraryEntry[]>(() => library.list());
  const [key, setKey] = useState(0);
  const [notice, setNotice] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const assets = useAssets();
  const fileInput = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const latest = useRef<ComposerData | null>(null);

  useEffect(() => {
    Promise.all([fetch('/api/examples').then((r) => r.json() as Promise<Examples>), fetch('/api/themes').then((r) => r.json() as Promise<CanvasMetadata['themes']>)]).then(([ex, th]) => {
      setExamples(ex);
      setThemes(th);
      assetStore.set(ex.assets);
      const last = library.list()[0];
      if (last) openMine(last);
      else openExample(ex, ex.names.includes('invoice') ? 'invoice' : ex.names[0]!);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mount = (c: Current, model: DocumentModel, sampleData: unknown) => {
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
    (c: Current, d: ComposerData) => {
      const model = dataToModel(d, assetStore.get(), c.id);
      let sampleData: unknown = {};
      try {
        sampleData = JSON.parse(String(d.root.props?.sampleData || '{}'));
      } catch {
        sampleData = d.root.props?.sampleData ?? '{}';
      }
      const saved = library.save({ id: c.id, name: model.name, model, sampleData });
      setMine(library.list());
      return saved;
    },
    [],
  );

  /** Edits to an example fork it into the library; edits to a library entry save in place. */
  const onChange = (d: ComposerData) => {
    latest.current = d;
    if (!current) return;
    if (current.source === 'example') {
      const forked: Current = { id: library.newId(), name: current.name, source: 'mine' };
      setCurrent(forked);
      persist(forked, d);
      setNotice(`Saved as your own copy of "${current.name}"`);
      return;
    }
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const saved = persist(current, d);
      if (saved.name !== current.name) setCurrent({ ...current, name: saved.name });
    }, 800);
  };

  const newBlank = () => {
    const id = library.newId();
    const model = blankModel(id);
    library.save({ id, name: model.name, model, sampleData: {} });
    setMine(library.list());
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
      library.save({ id, name: model.name, model, sampleData });
      setMine(library.list());
      mount({ id, name: model.name, source: 'mine' }, model, sampleData);
      setNotice(`Opened ${file.name}`);
    } catch (e) {
      setNotice(`Could not open ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const duplicate = () => {
    if (!current || !latest.current && current.source !== 'mine') return;
    const d = latest.current ?? data;
    if (!d) return;
    const id = library.newId();
    const entry = persist({ id, name: `${current.name} (copy)`, source: 'mine' }, { ...d, root: { ...d.root, props: { ...d.root.props!, name: `${current.name} (copy)` } } });
    openMine(entry);
  };

  const remove = () => {
    if (!current || current.source !== 'mine') return;
    library.remove(current.id);
    setMine(library.list());
    const next = library.list()[0];
    if (next) openMine(next);
    else if (examples) openExample(examples, examples.names[0]!);
  };

  /** A generated or rewritten template lands in the library as its own entry. */
  const adopt = (model: DocumentModel, sampleData: unknown, note: string) => {
    const id = library.newId();
    library.save({ id, name: model.name, model: { ...model, id }, sampleData: sampleData ?? {} });
    setMine(library.list());
    mount({ id, name: model.name, source: 'mine' }, { ...model, id }, sampleData ?? {});
    setNotice(note);
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
                  else {
                    const entry = library.get(id);
                    if (entry) openMine(entry);
                  }
                }}
              >
                <optgroup label="My templates">
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
              <button type="button" onClick={newBlank}>New</button>
              <button type="button" onClick={() => fileInput.current?.click()}>Open…</button>
              <button type="button" onClick={duplicate}>Duplicate</button>
              <button type="button" onClick={() => setAiOpen(true)}>AI…</button>
              {current.source === 'mine' ? (
                <button type="button" className="pw-danger" onClick={remove}>Delete</button>
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
