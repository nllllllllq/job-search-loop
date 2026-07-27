import { openDatabase } from '../../src/main/database';

export function createTestDatabase() {
  return openDatabase(':memory:');
}
