import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations';

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path, { timeout: 5000 });
  migrate(db);
  return db;
}
