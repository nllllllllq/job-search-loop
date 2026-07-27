import type { DatabaseSync } from 'node:sqlite';

export type DatabaseRow = Record<string, unknown>;

export class RepositoryError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export function notFound(resource: string, id: string): never {
  throw new RepositoryError('NOT_FOUND', `${resource} not found: ${id}`);
}

export function row(value: unknown, resource: string): DatabaseRow {
  if (value === null || value === undefined || typeof value !== 'object') {
    throw new Error(`Invalid ${resource} database row`);
  }
  return value as DatabaseRow;
}

export function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid database field: ${field}`);
  return value;
}

export function nullableText(value: unknown, field: string): string | null {
  if (value === null) return null;
  return text(value, field);
}

export function integer(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`Invalid database field: ${field}`);
  }
  return value;
}

export function json(value: unknown, field: string): unknown {
  try {
    return JSON.parse(text(value, field));
  } catch {
    throw new Error(`Invalid JSON database field: ${field}`);
  }
}

export function transaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
