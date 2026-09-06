import { describe, expect, it } from 'vitest';
import type { Block, DocumentModel } from '@paperwright/model';
import { describeDiff, diffTemplates } from '../src/diff';

const base: DocumentModel = {
  version: 1, id: 't', name: 'T', locale: 'en-GB',
  page: { size: 'A4', orientation: 'portrait', margins: { top: 40, right: 40, bottom: 40, left: 40 } },
  assets: [],
  blocks: [
    { id: 'h', type: 'heading', level: 1, text: 'Title' },
    { id: 's', type: 'section', title: 'Details', blocks: [{ id: 'p', type: 'text', rich: { spans: [{ text: 'Hello' }] } }] },
    { id: 'd', type: 'divider' },
    { id: 'x', type: 'divider' },
  ],
};
const block = (id: string): Block => ({ id, type: 'divider' });

describe('diffTemplates', () => {
  it('sees a change to a block, an addition, a removal and a move, and leaves untouched containers alone', () => {
    const after: DocumentModel = {
      ...base,
      blocks: [
        { id: 's', type: 'section', title: 'Details', blocks: [{ id: 'p', type: 'text', rich: { spans: [{ text: 'Hello there' }] } }, { id: 'n', type: 'divider' }] },
        { id: 'd', type: 'divider' },
        { id: 'h', type: 'heading', level: 1, text: 'Title' },
      ],
    };
    const diff = diffTemplates(base, after);
    expect(diff).toEqual({ added: ['n'], removed: ['x'], changed: ['p'], moved: ['h'], documentChanged: false });
    expect(describeDiff(diff)).toBe('1 changed, 1 added, 1 removed, 1 moved');
  });

  it('counts a container as changed only when its own fields change', () => {
    const after: DocumentModel = { ...base, blocks: [base.blocks[0]!, { ...(base.blocks[1] as Extract<Block, { type: 'section' }>), title: 'Particulars' }, base.blocks[2]!, base.blocks[3]!] };
    expect(diffTemplates(base, after).changed).toEqual(['s']);
  });

  it('reports only the block that moved, not the siblings it displaced', () => {
    const before: DocumentModel = { ...base, blocks: [block('a'), block('b'), block('c')] };
    expect(diffTemplates(before, { ...before, blocks: [block('b'), block('c'), block('a')] }).moved).toEqual(['a']);
    expect(diffTemplates(before, { ...before, blocks: [block('c'), block('a'), block('b')] }).moved).toEqual(['c']);
  });

  it('sees a block crossing between the header, the body and the footer as a move', () => {
    const before: DocumentModel = { ...base, header: [block('top')], blocks: [block('a')], footer: [block('foot')] };
    expect(diffTemplates(before, { ...before, header: [], blocks: [block('top'), block('a')] })).toMatchObject({ moved: ['top'], documentChanged: false });
    expect(diffTemplates(before, { ...before, blocks: [], footer: [block('foot'), block('a')] })).toMatchObject({ moved: ['a'], added: [], removed: [] });
  });

  it('ignores the order of keys, which the schema and a builder write differently', () => {
    const reordered: DocumentModel = {
      ...base,
      blocks: [{ type: 'heading', text: 'Title', level: 1, id: 'h' }, base.blocks[1]!, base.blocks[2]!, base.blocks[3]!],
    };
    expect(describeDiff(diffTemplates(base, reordered))).toBe('no changes');
  });

  it('reports page setup changes separately and no changes as such', () => {
    expect(diffTemplates(base, { ...base, page: { ...base.page, orientation: 'landscape' } })).toMatchObject({ documentChanged: true, changed: [] });
    expect(describeDiff(diffTemplates(base, base))).toBe('no changes');
  });
});
