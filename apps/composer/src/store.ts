import type { DocumentModel } from '@paperwright/model';
import { library } from './library';
import type { LibraryEntry } from './library';

/**
 * Where templates live. The browser store is always there; the dev API's file store, when the
 * server offers it, keeps templates on disk so they survive browsers and machines. A host
 * implements this same interface against its own database.
 */
export interface TemplateStore {
  readonly name: string;
  list(): Promise<LibraryEntry[]>;
  get(id: string): Promise<LibraryEntry | undefined>;
  save(entry: Omit<LibraryEntry, 'updatedAt'>): Promise<LibraryEntry>;
  remove(id: string): Promise<void>;
}

export const browserStore: TemplateStore = {
  name: 'this browser',
  list: async () => library.list(),
  get: async (id) => library.get(id),
  save: async (entry) => library.save(entry),
  remove: async (id) => library.remove(id),
};

/** REST over the dev API (or any host that serves the same four routes). */
export function httpStore(baseUrl = '/api/templates', name = 'the server'): TemplateStore {
  const check = async <T,>(res: Response, fallback?: T): Promise<T> => {
    if (res.status === 404 && fallback !== undefined) return fallback;
    if (!res.ok) throw new Error(`${name} answered ${res.status}`);
    return (await res.json()) as T;
  };
  return {
    name,
    list: () => fetch(baseUrl).then((r) => check<LibraryEntry[]>(r)),
    get: (id) => fetch(`${baseUrl}/${encodeURIComponent(id)}`).then((r) => check<LibraryEntry | undefined>(r, undefined)),
    save: (entry) =>
      fetch(`${baseUrl}/${encodeURIComponent(entry.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }).then((r) => check<LibraryEntry>(r)),
    remove: async (id) => {
      await fetch(`${baseUrl}/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => check<unknown>(r, null));
    },
  };
}

/** The server's store when it answers, otherwise the browser's. */
export async function chooseStore(): Promise<TemplateStore> {
  try {
    const res = await fetch('/api/templates', { method: 'HEAD' });
    if (res.ok) return httpStore();
  } catch {
    // no server store
  }
  return browserStore;
}

export type { DocumentModel };
