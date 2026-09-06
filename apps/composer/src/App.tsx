import { Puck, blocksPlugin, fieldsPlugin, outlinePlugin } from '@puckeditor/core';
import type { Plugin } from '@puckeditor/core';
import { useEffect, useMemo, useState } from 'react';
import { migrateModel } from '@paperwright/model';
import { createConfig } from './config';
import type { CanvasMetadata } from './config';
import { PreviewPanel } from './panel/PreviewPanel';
import type { ComposerData } from './puck';
import { dataToModel, modelToData } from './transform';

interface Examples {
  names: string[];
  examples: Record<string, { template: unknown; data: unknown }>;
  assets: string[];
}

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function App() {
  const [examples, setExamples] = useState<Examples | null>(null);
  const [themes, setThemes] = useState<CanvasMetadata['themes'] | null>(null);
  const [selected, setSelected] = useState('invoice');
  const [data, setData] = useState<ComposerData | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    Promise.all([fetch('/api/examples').then((r) => r.json() as Promise<Examples>), fetch('/api/themes').then((r) => r.json() as Promise<CanvasMetadata['themes']>)]).then(([ex, th]) => {
      setExamples(ex);
      setThemes(th);
      const name = ex.names.includes('invoice') ? 'invoice' : ex.names[0]!;
      load(ex, name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = (ex: Examples, name: string) => {
    const example = ex.examples[name];
    if (!example) return;
    setSelected(name);
    setData(modelToData(migrateModel(example.template), example.data));
    setKey((k) => k + 1);
  };

  const metadata = useMemo<CanvasMetadata>(() => ({ themes: themes ?? {}, assets: examples?.assets ?? [] }), [themes, examples]);
  const config = useMemo(() => createConfig(examples?.assets ?? []), [examples]);

  const plugins = useMemo<Plugin[]>(
    () => [
      blocksPlugin(),
      outlinePlugin(),
      fieldsPlugin({ desktopSideBar: 'right' }),
      {
        name: 'paperwright-preview',
        label: 'PDF',
        icon: <span style={{ fontWeight: 700, fontSize: 11 }}>PDF</span>,
        render: () => <PreviewPanel assets={examples?.assets ?? []} />,
      },
    ],
    [examples],
  );

  if (!data || !examples || !themes) return <div className="pw-loading">Loading…</div>;

  return (
    <Puck
      key={key}
      config={config}
      data={data}
      metadata={metadata}
      plugins={plugins}
      iframe={{ enabled: false }}
      headerTitle={`paperwright · ${selected}`}
      onPublish={(d) => {
        const model = dataToModel(d, examples.assets.map((hash) => ({ hash, mime: 'image/png' as const })), selected);
        download(selected, JSON.stringify(model, null, 2));
      }}
      overrides={{
        headerActions: ({ children }) => (
          <>
            <div className="pw-header-actions">
              <select value={selected} onChange={(e) => load(examples, e.target.value)}>
                {examples.names.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            {children}
          </>
        ),
      }}
    />
  );
}
