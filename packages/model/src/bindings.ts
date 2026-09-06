import type { Binding, Filter } from './types';

/** One piece of a template string: literal text or a binding. */
export type TextPart = { kind: 'text'; text: string } | { kind: 'binding'; binding: Binding };

const INTERPOLATION = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Splits `Hello {{ name | upper }}, {{ total | currency:GHS }}` into literal and binding parts.
 * The grammar is deliberately small: a path, then zero or more `| filter:arg,arg` steps.
 */
export function parseTemplate(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(INTERPOLATION)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ kind: 'text', text: text.slice(last, index) });
    parts.push({ kind: 'binding', binding: parseBindingExpression(match[1] ?? '') });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

export function parseBindingExpression(expression: string): Binding {
  const [head, ...steps] = splitUnquoted(expression, '|');
  const filters = steps.map(parseFilter).filter((f): f is Filter => f !== null);
  const binding: Binding = { var: (head ?? '').trim() };
  if (filters.length > 0) binding.filters = filters;
  return binding;
}

const FILTER_NAMES = new Set<Filter['name']>(['date', 'number', 'currency', 'upper', 'lower', 'default', 'join']);

function parseFilter(step: string): Filter | null {
  const trimmed = step.trim();
  if (!trimmed) return null;
  const colon = trimmed.indexOf(':');
  const name = (colon === -1 ? trimmed : trimmed.slice(0, colon)).trim();
  if (!FILTER_NAMES.has(name as Filter['name'])) {
    throw new Error(`Unknown filter "${name}" in "{{ ${step.trim()} }}"`);
  }
  if (colon === -1) return { name: name as Filter['name'] };
  const args = splitUnquoted(trimmed.slice(colon + 1), ',').map(unquote);
  return { name: name as Filter['name'], args: positionalArgs(name as Filter['name'], args) };
}

/** Each filter names its positional arguments so the object form and the string form line up. */
const ARG_NAMES: Record<Filter['name'], string[]> = {
  date: ['style'],
  number: ['min', 'max'],
  currency: ['code', 'display'],
  upper: [],
  lower: [],
  default: ['value'],
  join: ['separator'],
};

function positionalArgs(name: Filter['name'], args: string[]): Record<string, string> {
  const names = ARG_NAMES[name];
  const out: Record<string, string> = {};
  args.forEach((value, i) => {
    const key = names[i] ?? `arg${i}`;
    out[key] = value;
  });
  return out;
}

function splitUnquoted(input: string, separator: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const ch of input) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === separator) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

/** Turns a binding back into its inline form; the builder uses this when a user edits a field as text. */
export function formatBinding(binding: Binding): string {
  const steps = (binding.filters ?? []).map((f) => {
    const names = ARG_NAMES[f.name];
    const args = names.map((n) => f.args?.[n]).filter((a): a is string => a !== undefined && a !== '');
    return args.length ? `${f.name}:${args.map(quoteIfNeeded).join(',')}` : f.name;
  });
  return `{{ ${[binding.var, ...steps].join(' | ')} }}`;
}

function quoteIfNeeded(value: string): string {
  return /[,|:\s]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

/** Splits `a.b[0].c` (or `a.b.0.c`) into segments. */
export function parsePath(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Reads a path from a value; missing links yield undefined rather than throwing. */
export function getPath(root: unknown, segments: string[]): unknown {
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
