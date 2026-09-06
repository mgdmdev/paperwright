import { validateModel } from './schema';
import type { DocumentModel, SchemaVersion } from './types';

export const CURRENT_VERSION: SchemaVersion = 1;

interface Migration {
  from: number;
  to: number;
  apply(input: Record<string, unknown>): Record<string, unknown>;
}

/** Ordered steps from each older version to the next. Empty until version 2 exists. */
const MIGRATIONS: Migration[] = [];

export class ModelError extends Error {
  constructor(
    message: string,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ModelError';
  }
}

/**
 * Opens a stored template of any supported version and returns it at the current version,
 * validated. Throws ModelError with the issues when the template cannot be opened.
 */
export function migrateModel(input: unknown): DocumentModel {
  if (input === null || typeof input !== 'object') throw new ModelError('A template must be an object');
  let current = input as Record<string, unknown>;
  let version = typeof current.version === 'number' ? current.version : NaN;
  if (!Number.isInteger(version)) throw new ModelError('A template must carry a numeric "version"');
  if (version > CURRENT_VERSION) {
    throw new ModelError(`Template version ${version} is newer than this library supports (${CURRENT_VERSION})`);
  }
  while (version < CURRENT_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === version);
    if (!step) throw new ModelError(`No migration from template version ${version}`);
    current = step.apply(current);
    version = step.to;
  }
  const result = validateModel(current);
  if (!result.ok) throw new ModelError('Template failed validation', result.issues);
  return result.model;
}
