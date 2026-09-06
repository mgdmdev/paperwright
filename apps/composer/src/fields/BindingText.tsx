import { FieldLabel } from '@puckeditor/core';
import type { CustomField } from '@puckeditor/core';
import { useMemo, useRef, useState } from 'react';
import { getPath, parsePath, parseTemplate } from '@paperwright/model';
import { usePuckStore } from '../puck';
import type { Component } from '../transform';

/** Every dotted path a data sample offers, arrays flattened to their element shape. */
export function samplePaths(value: unknown, prefix = '', out: string[] = []): string[] {
  if (Array.isArray(value)) {
    if (prefix) out.push(prefix);
    if (value.length) samplePaths(value[0], prefix, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) samplePaths(v, prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  if (prefix) out.push(prefix);
  return out;
}

const isComponent = (v: unknown): v is Component =>
  !!v && typeof v === 'object' && typeof (v as Component).type === 'string' && typeof (v as Component).props === 'object';

/** The chain of components above the one with `id`, outermost first; slots are any component arrays in props. */
export function ancestorsOf(roots: unknown[], id: string, chain: Component[] = []): Component[] | null {
  for (const node of roots) {
    if (!isComponent(node)) continue;
    if (node.props.id === id) return chain;
    for (const value of Object.values(node.props)) {
      if (Array.isArray(value)) {
        const found = ancestorsOf(value, id, [...chain, node]);
        if (found) return found;
        for (const item of value) {
          if (item && typeof item === 'object' && !isComponent(item)) {
            for (const inner of Object.values(item as Record<string, unknown>)) {
              if (Array.isArray(inner)) {
                const deep = ancestorsOf(inner, id, [...chain, node]);
                if (deep) return deep;
              }
            }
          }
        }
      }
    }
  }
  return null;
}

const problem = (text: string, mode: Mode): string | null => {
  if (mode === 'path') return text.includes('{{') ? 'A path, without {{ }}' : null;
  if (!text.includes('{{')) return null;
  try {
    parseTemplate(text);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

type Mode = 'template' | 'path';

interface Choice {
  label: string;
  value: string;
}

/**
 * A text field that knows about bindings. In template mode `{{ path | filter }}` is checked as you
 * type and the picker inserts `{{ path }}` at the cursor; in path mode the value is a bare path and
 * the picker replaces it. The picker lists the sample data's paths, and inside a repeat or a data
 * table row the loop-relative ones first.
 */
function BindingTextField({ name, value, onChange, field, multiline, mode }: { name: string; value: string; onChange: (v: string) => void; field: { label?: string }; multiline?: boolean; mode: Mode }) {
  // Each selector returns a value the store already holds; a fresh array here would re-render forever.
  const sample = usePuckStore((s) => String(s.appState.data.root.props?.sampleData ?? '{}'));
  const selected = usePuckStore((s) => s.selectedItem as Component | null);
  const content = usePuckStore((s) => s.appState.data.content as unknown[]);
  const header = usePuckStore((s) => (s.appState.data.root.props as { header?: unknown[] } | undefined)?.header);
  const footer = usePuckStore((s) => (s.appState.data.root.props as { footer?: unknown[] } | undefined)?.footer);
  const roots = useMemo(() => [...content, ...(header ?? []), ...(footer ?? [])], [content, header, footer]);

  const choices = useMemo<Choice[]>(() => {
    let data: unknown = {};
    try {
      data = JSON.parse(sample);
    } catch {
      return [];
    }
    const scoped: Choice[] = [];
    const ancestors = selected?.props.id ? (ancestorsOf(roots, selected.props.id) ?? []) : [];
    for (const a of ancestors) {
      if (a.type === 'Repeat') {
        const rows = getPath(data, parsePath(String(a.props.forEach ?? '')));
        const as = String(a.props.as || 'item');
        if (Array.isArray(rows) && rows.length) scoped.push(...samplePaths(rows[0], as).map((p) => ({ label: `${p}  (this ${as})`, value: p })));
      }
    }
    if (selected?.type === 'DataTable' && /cell$/.test(name)) {
      const rows = getPath(data, parsePath(String(selected.props.rowBinding ?? '')));
      if (Array.isArray(rows) && rows.length) scoped.push(...samplePaths(rows[0]).map((p) => ({ label: `${p}  (this row)`, value: p })));
      scoped.push({ label: '$number  (row number)', value: '$number' }, { label: '$index  (row index)', value: '$index' });
    }
    const root = [...new Set(samplePaths(data))].sort().map((p) => ({ label: p, value: p }));
    return [...scoped, ...root];
  }, [sample, selected, roots, name]);

  const input = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [pick, setPick] = useState('');
  const text = value ?? '';
  const error = problem(text, mode);

  const insert = (path: string) => {
    if (!path) return;
    if (mode === 'path') {
      onChange(path);
    } else {
      const el = input.current;
      const start = el?.selectionStart ?? text.length;
      const end = el?.selectionEnd ?? text.length;
      onChange(text.slice(0, start) + `{{ ${path} }}` + text.slice(end));
    }
    setPick('');
    requestAnimationFrame(() => input.current?.focus());
  };

  return (
    <FieldLabel label={field.label ?? name}>
      <div className="pw-binding-field">
        {multiline ? (
          <textarea ref={input as React.RefObject<HTMLTextAreaElement>} name={name} value={text} rows={3} onChange={(e) => onChange(e.currentTarget.value)} />
        ) : (
          <input ref={input as React.RefObject<HTMLInputElement>} name={name} value={text} onChange={(e) => onChange(e.currentTarget.value)} />
        )}
        <select value={pick} onChange={(e) => insert(e.currentTarget.value)} title={mode === 'path' ? 'Pick a path from the sample data' : 'Insert a value from the sample data'}>
          <option value="">{mode === 'path' ? 'pick a path…' : '{{ … }}'}</option>
          {choices.map((c) => (
            <option key={c.value + c.label} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {error ? <div className="pw-field-error">{error}</div> : null}
      </div>
    </FieldLabel>
  );
}

export const bindingText = (label: string, multiline = false): CustomField<string> => ({
  type: 'custom',
  label,
  render: ({ name, value, onChange, field }) => <BindingTextField name={name} value={value} onChange={onChange} field={field} multiline={multiline} mode="template" />,
});

/** For fields that hold a bare data path (a repeat's array, a data table's rows). */
export const pathText = (label: string): CustomField<string> => ({
  type: 'custom',
  label,
  render: ({ name, value, onChange, field }) => <BindingTextField name={name} value={value} onChange={onChange} field={field} mode="path" />,
});
