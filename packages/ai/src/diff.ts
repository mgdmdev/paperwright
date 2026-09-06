import type { Block, DocumentModel } from '@paperwright/model';

export interface TemplateDiff {
  added: string[];
  removed: string[];
  changed: string[];
  /** Blocks whose own fields are the same but whose position or parent moved. */
  moved: string[];
  /** Page setup, name, locale or theme changed. */
  documentChanged: boolean;
}

interface Entry {
  block: Block;
  parent: string;
}

/** Every block by id with the container it sits in, and every container's children in order. */
interface Tree {
  entries: Map<string, Entry>;
  order: Map<string, string[]>;
}

function walk(blocks: Block[], parent: string, tree: Tree) {
  tree.order.set(parent, blocks.map((b) => b.id));
  for (const block of blocks) {
    tree.entries.set(block.id, { block, parent });
    if (block.type === 'section' || block.type === 'keepTogether' || block.type === 'repeat') walk(block.blocks, `${block.id}.blocks`, tree);
    if (block.type === 'columns') block.columns.forEach((c, j) => walk(c.blocks, `${block.id}.columns.${j}`, tree));
    if (block.type === 'if') {
      walk(block.then, `${block.id}.then`, tree);
      if (block.else) walk(block.else, `${block.id}.else`, tree);
    }
  }
}

/** The bands are parents of their own, so a block crossing from the header into the body is a move. */
function tree(model: DocumentModel): Tree {
  const t: Tree = { entries: new Map(), order: new Map() };
  walk(model.header ?? [], 'header', t);
  walk(model.blocks, 'body', t);
  walk(model.footer ?? [], 'footer', t);
  return t;
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

/** JSON with keys sorted at every level: the schema's key order and a builder's differ, and that is not an edit. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, (v as Record<string, unknown>)[k]]),
        )
      : v,
  );

const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** The ids that keep their relative order between two sibling lists (a longest common subsequence). */
function stable(before: string[], after: string[]): Set<string> {
  const n = before.length;
  const m = after.length;
  const length: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      length[i]![j] = before[i] === after[j] ? length[i + 1]![j + 1]! + 1 : Math.max(length[i + 1]![j]!, length[i]![j + 1]!);
    }
  }
  const kept = new Set<string>();
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (before[i] === after[j]) {
      kept.add(before[i]!);
      i++;
      j++;
    } else if (length[i + 1]![j]! >= length[i]![j + 1]!) i++;
    else j++;
  }
  return kept;
}

/** What an edit (a person's or a model's) did to a template, by block id. */
export function diffTemplates(before: DocumentModel, after: DocumentModel): TemplateDiff {
  const a = tree(before);
  const b = tree(after);
  const diff: TemplateDiff = { added: [], removed: [], changed: [], moved: [], documentChanged: false };
  // A sibling that only shifted because another was moved has not moved itself.
  const kept = new Set<string>();
  for (const [parent, ids] of b.order) {
    const inBoth = (list: string[], other: Tree) => list.filter((id) => other.entries.get(id)?.parent === parent);
    for (const id of stable(inBoth(a.order.get(parent) ?? [], b), inBoth(ids, a))) kept.add(id);
  }
  for (const [id, entry] of b.entries) {
    const prev = a.entries.get(id);
    if (!prev) diff.added.push(id);
    else if (!same(own(prev.block), own(entry.block))) diff.changed.push(id);
    else if (!kept.has(id)) diff.moved.push(id);
  }
  for (const id of a.entries.keys()) if (!b.entries.has(id)) diff.removed.push(id);
  const doc = (m: DocumentModel) => ({ name: m.name, locale: m.locale, theme: m.theme, page: m.page });
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
