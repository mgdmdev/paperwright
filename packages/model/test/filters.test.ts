import { describe, expect, it } from 'vitest';
import { applyFilters, toText } from '../src/filters';

const en = { locale: 'en-GB' };
const fr = { locale: 'fr-FR' };

describe('filters', () => {
  it('formats dates by locale without shifting a bare date', () => {
    expect(applyFilters('2026-09-01', [{ name: 'date', args: { style: 'long' } }], en)).toBe('1 September 2026');
    expect(applyFilters('2026-09-01', [{ name: 'date', args: { style: 'long' } }], fr)).toBe('1 septembre 2026');
    expect(applyFilters('2026-09-01', [{ name: 'date', args: { style: 'iso' } }], en)).toBe('2026-09-01');
  });

  it('formats numbers and currency by locale', () => {
    expect(applyFilters(1234.5, [{ name: 'number', args: { min: '2' } }], en)).toBe('1,234.50');
    expect(applyFilters(1234.5, [{ name: 'currency', args: { code: 'GHS' } }], en)).toMatch(/(GH₵|GHS)\s?1,234\.50/);
    expect(applyFilters(1234.5, [{ name: 'currency', args: { code: 'EUR' } }], fr)).toMatch(/1\s234,50\s€/);
  });

  it('prints the local calendar day for iso and for bare Dates in any zone', () => {
    // A local-midnight Date must never come back as the previous UTC day.
    const local = new Date(2026, 0, 1);
    expect(applyFilters(local, [{ name: 'date', args: { style: 'iso' } }], en)).toBe('2026-01-01');
    expect(toText(local)).toBe('2026-01-01');
  });

  it('returns invalid dates and numbers unchanged instead of throwing', () => {
    expect(applyFilters(NaN, [{ name: 'date' }], en)).toBeNaN();
    expect(applyFilters(1e20, [{ name: 'date' }], en)).toBe(1e20);
    expect(applyFilters('not a date', [{ name: 'date', args: { style: 'long' } }], en)).toBe('not a date');
    expect(toText(new Date('garbage'))).toBe('');
  });

  it('leaves non-numeric input alone', () => {
    expect(applyFilters('n/a', [{ name: 'currency', args: { code: 'GHS' } }], en)).toBe('n/a');
  });

  it('chains upper, default and join', () => {
    expect(applyFilters(undefined, [{ name: 'default', args: { value: 'x' } }, { name: 'upper' }], en)).toBe('X');
    expect(applyFilters(['a', 'b'], [{ name: 'join', args: { separator: ' / ' } }], en)).toBe('a / b');
  });
});

describe('toText', () => {
  it('stringifies the usual suspects', () => {
    expect(toText(undefined)).toBe('');
    expect(toText(3)).toBe('3');
    expect(toText([1, 'b'])).toBe('1, b');
    expect(toText({ a: 1 })).toBe('{"a":1}');
  });
});
