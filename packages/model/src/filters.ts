import type { Filter } from './types';

export interface FilterContext {
  locale: string;
}

type FilterFn = (value: unknown, args: Record<string, string>, ctx: FilterContext) => unknown;

const DATE_STYLES = new Set(['short', 'medium', 'long', 'full']);

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string' && value.trim()) {
    // A bare calendar date is a local date, not midnight UTC shifted into yesterday.
    const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (bare) return new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]));
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const FILTERS: Record<Filter['name'], FilterFn> = {
  date: (value, args, ctx) => {
    const date = toDate(value);
    if (!date) return value;
    const style = args.style ?? 'medium';
    if (style === 'iso') return date.toISOString().slice(0, 10);
    if (style === 'time') return new Intl.DateTimeFormat(ctx.locale, { timeStyle: 'short' }).format(date);
    if (style === 'datetime') {
      return new Intl.DateTimeFormat(ctx.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    }
    if (style === 'month') return new Intl.DateTimeFormat(ctx.locale, { month: 'long', year: 'numeric' }).format(date);
    const dateStyle = DATE_STYLES.has(style) ? (style as 'short' | 'medium' | 'long' | 'full') : 'medium';
    return new Intl.DateTimeFormat(ctx.locale, { dateStyle }).format(date);
  },
  number: (value, args, ctx) => {
    const n = toNumber(value);
    if (n === null) return value;
    const min = args.min !== undefined ? Number(args.min) : undefined;
    const max = args.max !== undefined ? Number(args.max) : min;
    return new Intl.NumberFormat(ctx.locale, {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    }).format(n);
  },
  currency: (value, args, ctx) => {
    const n = toNumber(value);
    if (n === null) return value;
    const code = args.code ?? 'USD';
    const display = args.display === 'code' || args.display === 'name' || args.display === 'narrowSymbol' ? args.display : 'symbol';
    return new Intl.NumberFormat(ctx.locale, { style: 'currency', currency: code, currencyDisplay: display }).format(n);
  },
  upper: (value) => (typeof value === 'string' ? value.toUpperCase() : value),
  lower: (value) => (typeof value === 'string' ? value.toLowerCase() : value),
  default: (value, args) => (value === undefined || value === null || value === '' ? (args.value ?? '') : value),
  join: (value, args) => (Array.isArray(value) ? value.map(toText).join(args.separator ?? ', ') : value),
};

export function applyFilters(value: unknown, filters: Filter[] | undefined, ctx: FilterContext): unknown {
  let current = value;
  for (const filter of filters ?? []) {
    current = FILTERS[filter.name](current, filter.args ?? {}, ctx);
  }
  return current;
}

/** The final step for anything that ends up on the page. */
export function toText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(toText).join(', ');
  return JSON.stringify(value);
}
