import type { DocumentModel } from '@paperwright/model';

/**
 * The templates a person makes, kept in the browser. Examples are read-only starting points;
 * the first edit to one forks it into the library.
 */
export interface LibraryEntry {
  id: string;
  name: string;
  model: DocumentModel;
  sampleData: unknown;
  updatedAt: string;
}

const KEY = 'paperwright.templates';

const read = (): Record<string, LibraryEntry> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, LibraryEntry>;
  } catch {
    return {};
  }
};

const write = (entries: Record<string, LibraryEntry>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Storage full or blocked: the session still works, it just is not remembered.
  }
};

export const library = {
  list(): LibraryEntry[] {
    return Object.values(read()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  get(id: string): LibraryEntry | undefined {
    return read()[id];
  },
  save(entry: Omit<LibraryEntry, 'updatedAt'>): LibraryEntry {
    const entries = read();
    const saved = { ...entry, updatedAt: new Date().toISOString() };
    entries[entry.id] = saved;
    write(entries);
    return saved;
  },
  remove(id: string) {
    const entries = read();
    delete entries[id];
    write(entries);
  },
  newId: () => `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
};

/** A starting point with the page set up and one heading, so the canvas is never empty. */
export const blankModel = (id: string, name = 'Untitled'): DocumentModel => ({
  version: 1,
  id,
  name,
  locale: 'en-GB',
  theme: 'professional',
  page: { size: 'A4', orientation: 'portrait', margins: { top: 56, right: 48, bottom: 56, left: 48 } },
  assets: [],
  blocks: [{ id: 'title', type: 'heading', level: 1, text: name }],
});
