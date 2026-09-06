import { describe, expect, it } from 'vitest';
import type { DocumentModel } from '@paperwright/model';
import { describeDiff, diffTemplates } from '../src/diff';

const base: DocumentModel = {
  version: 1, id: 't', name: 'T', locale: 'en-GB',
  page: { size: 'A4', orientation: 'portrait', margins: { top: 40, right: 40, bottom: 40, left: 40 } },
  assets: [],
  blocks: [
    { id: 'h', type: 'heading', level: 1, text: 'Title' },
    { id: 's', type: 'section', title: 'Details', blocks: [{ id: 'p', type: 'text', rich: { spans: [{ text: 'Hello' }] } }] },
    { id: 'd', type: 'divider' },
  ],
};

describe('diffTemplates', () => {
  it('sees a change to a block, an addition, a removal and a move, and leaves untouched containers alone', () => {
    const after: DocumentModel = {
      ...base,
      blocks: [
        { id: 's', type: 'section', title: 'Details', blocks: [{ id: 'p', type: 'text', rich: { spans: [{ text: 'Hello there' }] } }, { id: 'n', type: 'divider' }] },
        { id: 'h', type: 'heading', level: 1, text: 'Title' },
      ],
    };
    const diff = diffTemplates(base, after);
    expect(diff).toEqual({ added: ['n'], removed: ['d'], changed: ['p'], moved: ['s', 'h'], documentChanged: false });
    expect(describeDiff(diff)).toBe('1 changed, 1 added, 1 removed, 2 moved');
  });

  it('counts a container as changed only when its own fields change', () => {
    const after: DocumentModel = { ...base, blocks: [base.blocks[0]!, { ...(base.blocks[1] as Extract<DocumentModel['blocks'][number], { type: 'section' }>), title: 'Particulars' }, base.blocks[2]!] };
    expect(diffTemplates(base, after).changed).toEqual(['s']);
  });

  it('reports page setup changes separately and no changes as such', () => {
    expect(diffTemplates(base, { ...base, page: { ...base.page, orientation: 'landscape' } })).toMatchObject({ documentChanged: true, changed: [] });
    expect(describeDiff(diffTemplates(base, base))).toBe('no changes');
  });
});
