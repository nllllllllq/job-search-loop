import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations';

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path, { timeout: 5000 });
  try {
    migrate(db);
    return db;
  } catch (error) {
    try {
      db.close();
    } catch {
      // Preserve the migration error as the actionable failure.
    }
    throw error;
  }
}
