import type { Block, DocumentModel } from '@paperwright/model';

export interface TemplateDiff {
  added: string[];
  removed: string[];
  changed: string[];
  /** Blocks whose own fields are the same but whose position or parent moved. */
  moved: string[];
  /** Page setup, name, locale, theme or the header/footer set changed. */
  documentChanged: boolean;
}

interface Entry {
  block: Block;
  parent: string;
  index: number;
}

/** Flattens a tree of blocks into id → entry, with the parent path so moves can be told from edits. */
function index(blocks: Block[], parent: string, out = new Map<string, Entry>()): Map<string, Entry> {
  blocks.forEach((block, i) => {
    out.set(block.id, { block, parent, index: i });
    if (block.type === 'section' || block.type === 'keepTogether' || block.type === 'repeat') index(block.blocks, `${block.id}.blocks`, out);
    if (block.type === 'columns') block.columns.forEach((c, j) => index(c.blocks, `${block.id}.columns.${j}`, out));
    if (block.type === 'if') {
      index(block.then, `${block.id}.then`, out);
      if (block.else) index(block.else, `${block.id}.else`, out);
    }
  });
  return out;
}

/** A block without its children, so a container counts as changed only when its own fields change. */
const own = (block: Block): unknown => {
  switch (block.type) {
    case 'section':
    case 'keepTogether':
    case 'repeat':
      return { ...block, blocks: undefined };
    case 'columns':
      return { ...block, columns: block.columns.map((c) => ({ width: c.width })) };
    case 'if':
      return { ...block, then: undefined, else: undefined };
    default:
      return block;
  }
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What an edit (a person's or a model's) did to a template, by block id. */
export function diffTemplates(before: DocumentModel, after: DocumentModel): TemplateDiff {
  const a = index([...(before.header ?? []), ...before.blocks, ...(before.footer ?? [])], 'root');
  const b = index([...(after.header ?? []), ...after.blocks, ...(after.footer ?? [])], 'root');
  const diff: TemplateDiff = { added: [], removed: [], changed: [], moved: [], documentChanged: false };
  for (const [id, entry] of b) {
    const prev = a.get(id);
    if (!prev) diff.added.push(id);
    else if (!same(own(prev.block), own(entry.block))) diff.changed.push(id);
    else if (prev.parent !== entry.parent || prev.index !== entry.index) diff.moved.push(id);
  }
  for (const id of a.keys()) if (!b.has(id)) diff.removed.push(id);
  const doc = (m: DocumentModel) => ({ name: m.name, locale: m.locale, theme: m.theme, page: m.page, header: (m.header ?? []).length, footer: (m.footer ?? []).length });
  diff.documentChanged = !same(doc(before), doc(after));
  return diff;
}

/** One line for a notice: "3 changed, 1 added, 2 removed, 1 moved". */
export function describeDiff(diff: TemplateDiff): string {
  const parts = [
    diff.changed.length ? `${diff.changed.length} changed` : '',
    diff.added.length ? `${diff.added.length} added` : '',
    diff.removed.length ? `${diff.removed.length} removed` : '',
    diff.moved.length ? `${diff.moved.length} moved` : '',
    diff.documentChanged ? 'page setup changed' : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'no changes';
}
