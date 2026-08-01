// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createCompanyAliasesRepository } from '../../src/main/repositories/company-aliases';
import { createPositionsRepository } from '../../src/main/repositories/positions';
import { registerPositionHandlers } from '../../src/main/ipc/positions';
import { CHANNELS } from '../../src/shared/ipc';
import { createTestDatabase } from '../helpers/database';

describe('confirmed company aliases', () => {
  it('validates explicit alias confirmation and removal over the narrow IPC contract', async () => {
    const db = createTestDatabase();

    try {
      const positions = createPositionsRepository(db);
      const aliases = createCompanyAliasesRepository(db);
      const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
      registerPositionHandlers({
        handle(channel, handler) { handlers.set(channel, handler); },
      }, positions, aliases);

      await expect(handlers.get(CHANNELS.companyAliases.confirm)!({}, {
        canonicalName: 'Northstar Labs', alias: 'Northstar',
      })).resolves.toMatchObject({
        canonicalName: 'Northstar Labs', alias: 'Northstar',
      });
      await expect(handlers.get(CHANNELS.companyAliases.confirm)!({}, {
        canonicalName: 'Northstar', alias: 'Northstar Labs',
      })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(handlers.get(CHANNELS.companyAliases.confirm)!({}, {
        canonicalName: 'Northstar Labs', alias: 'Northstar Labs',
      })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(handlers.get(CHANNELS.companyAliases.remove)!({}, 'Northstar'))
        .resolves.toBeUndefined();
    } finally {
      db.close();
    }
  });

  it('groups only a confirmed alias, orders groups by their latest member, and restores literal grouping after removal', () => {
    const db = createTestDatabase();

    try {
      const positions = createPositionsRepository(db);
      const aliases = createCompanyAliasesRepository(db);
      const canonical = positions.create({
        company: 'Northstar Labs',
        title: 'Product manager',
        interest: 5,
        rawJd: 'Own product discovery.',
      });
      const alias = positions.create({
        company: 'Northstar',
        title: 'Senior product manager',
        interest: 4,
        rawJd: 'Lead product strategy.',
      });
      const other = positions.create({
        company: 'Cedar Systems',
        title: 'Platform lead',
        interest: 3,
        rawJd: 'Lead platform delivery.',
      });
      db.prepare('UPDATE positions SET updated_at = ? WHERE id = ?').run(
        '2026-08-01T03:00:00.000Z', canonical.id,
      );
      db.prepare('UPDATE positions SET updated_at = ? WHERE id = ?').run(
        '2026-08-01T02:00:00.000Z', alias.id,
      );
      db.prepare('UPDATE positions SET updated_at = ? WHERE id = ?').run(
        '2026-08-01T01:00:00.000Z', other.id,
      );

      // Similar normalized names stay separate until the user explicitly confirms them.
      expect(positions.listGrouped!()).toMatchObject([
        { canonicalName: 'Northstar Labs', members: [{ id: canonical.id }] },
        { canonicalName: 'Northstar', members: [{ id: alias.id }] },
        { canonicalName: 'Cedar Systems', members: [{ id: other.id }] },
      ]);

      aliases.confirm({ canonicalName: 'Northstar Labs', alias: 'Northstar' });

      expect(positions.listGrouped!()).toMatchObject([
        {
          canonicalName: 'Northstar Labs',
          members: [{ id: canonical.id }, { id: alias.id }],
        },
        { canonicalName: 'Cedar Systems', members: [{ id: other.id }] },
      ]);

      aliases.remove('Northstar');

      expect(positions.listGrouped!().map((group) => group.canonicalName)).toEqual([
        'Northstar Labs',
        'Northstar',
        'Cedar Systems',
      ]);
    } finally {
      db.close();
    }
  });

  it('rejects a reverse confirmation without changing the existing alias', () => {
    const db = createTestDatabase();

    try {
      const aliases = createCompanyAliasesRepository(db);
      aliases.confirm({ canonicalName: 'Northstar Labs', alias: 'Northstar' });

      expect(() => aliases.confirm({ canonicalName: 'Northstar', alias: 'Northstar Labs' }))
        .toThrow(/canonical company identity/i);

      expect(db.prepare(`
        SELECT a.alias, c.canonical_name
        FROM company_aliases a
        JOIN canonical_companies c ON c.id = a.canonical_company_id
      `).all()).toEqual([
        { alias: 'Northstar', canonical_name: 'Northstar Labs' },
      ]);
    } finally {
      db.close();
    }
  });

  it('allows reversing a canonical choice after the only alias is removed', () => {
    const db = createTestDatabase();

    try {
      const aliases = createCompanyAliasesRepository(db);
      aliases.confirm({ canonicalName: 'Company A', alias: 'Company B' });

      aliases.remove('Company B');

      expect(() => aliases.confirm({ canonicalName: 'Company B', alias: 'Company A' }))
        .not.toThrow();
      expect(db.prepare(`
        SELECT a.alias, c.canonical_name
        FROM company_aliases a
        JOIN canonical_companies c ON c.id = a.canonical_company_id
      `).all()).toEqual([
        { alias: 'Company A', canonical_name: 'Company B' },
      ]);
    } finally {
      db.close();
    }
  });
});
