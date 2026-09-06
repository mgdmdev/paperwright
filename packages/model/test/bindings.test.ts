import { describe, expect, it } from 'vitest';
import { formatBinding, parseBindingExpression, parsePath, parseTemplate } from '../src/bindings';

describe('parseTemplate', () => {
  it('splits literal text and bindings', () => {
    expect(parseTemplate('Hi {{ name }}, total {{ total | currency:GHS }}!')).toEqual([
      { kind: 'text', text: 'Hi ' },
      { kind: 'binding', binding: { var: 'name' } },
      { kind: 'text', text: ', total ' },
      { kind: 'binding', binding: { var: 'total', filters: [{ name: 'currency', args: { code: 'GHS' } }] } },
      { kind: 'text', text: '!' },
    ]);
  });

  it('keeps a plain string as one literal part', () => {
    expect(parseTemplate('nothing here')).toEqual([{ kind: 'text', text: 'nothing here' }]);
  });

  it('parses quoted arguments that contain separators', () => {
    expect(parseBindingExpression('x | default:"a, b | c"')).toEqual({
      var: 'x',
      filters: [{ name: 'default', args: { value: 'a, b | c' } }],
    });
  });

  it('rejects an unknown filter', () => {
    expect(() => parseBindingExpression('x | shout')).toThrow(/Unknown filter "shout"/);
  });

  it('round-trips through formatBinding', () => {
    const b = parseBindingExpression('amount | number:2,2 | default:"n/a"');
    expect(formatBinding(b)).toBe('{{ amount | number:2,2 | default:n/a }}');
    expect(parseBindingExpression(formatBinding(b).slice(3, -3))).toEqual(b);
  });
});

describe('parsePath', () => {
  it('accepts dots and brackets', () => {
    expect(parsePath('lines[0].amount')).toEqual(['lines', '0', 'amount']);
    expect(parsePath('lines.0.amount')).toEqual(['lines', '0', 'amount']);
  });
});
