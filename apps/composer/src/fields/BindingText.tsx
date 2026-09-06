import { FieldLabel } from '@puckeditor/core';
import type { CustomField } from '@puckeditor/core';
import { useMemo, useRef, useState } from 'react';
import { parseTemplate } from '@paperwright/model';
import { usePuckStore } from '../puck';

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

const problem = (text: string): string | null => {
  if (!text.includes('{{')) return null;
  try {
    parseTemplate(text);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

/**
 * A text field that knows about bindings: `{{ path | filter }}` is checked as you type, and a
 * picker inserts a path from the sample data at the cursor.
 */
function BindingTextField({ name, value, onChange, field, multiline }: { name: string; value: string; onChange: (v: string) => void; field: { label?: string }; multiline?: boolean }) {
  const sample = usePuckStore((s) => String(s.appState.data.root.props?.sampleData ?? '{}'));
  const paths = useMemo(() => {
    try {
      return [...new Set(samplePaths(JSON.parse(sample)))].sort();
    } catch {
      return [];
    }
  }, [sample]);
  const input = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [pick, setPick] = useState('');
  const text = value ?? '';
  const error = problem(text);

  const insert = (path: string) => {
    if (!path) return;
    const el = input.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const snippet = `{{ ${path} }}`;
    onChange(text.slice(0, start) + snippet + text.slice(end));
    setPick('');
    requestAnimationFrame(() => el?.focus());
  };

  return (
    <FieldLabel label={field.label ?? name}>
      <div className="pw-binding-field">
        {multiline ? (
          <textarea ref={input as React.RefObject<HTMLTextAreaElement>} name={name} value={text} rows={3} onChange={(e) => onChange(e.currentTarget.value)} />
        ) : (
          <input ref={input as React.RefObject<HTMLInputElement>} name={name} value={text} onChange={(e) => onChange(e.currentTarget.value)} />
        )}
        <select value={pick} onChange={(e) => insert(e.currentTarget.value)} title="Insert a value from the sample data">
          <option value="">{'{{ … }}'}</option>
          {paths.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value="$number">$number (row number)</option>
          <option value="$index">$index (row index)</option>
        </select>
        {error ? <div className="pw-field-error">{error}</div> : null}
      </div>
    </FieldLabel>
  );
}

export const bindingText = (label: string, multiline = false): CustomField<string> => ({
  type: 'custom',
  label,
  render: ({ name, value, onChange, field }) => <BindingTextField name={name} value={value} onChange={onChange} field={field} multiline={multiline} />,
});
