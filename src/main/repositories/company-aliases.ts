import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { CompanyAlias, CompanyAliasConfirmation } from '../../shared/domain';
import { companyAliasConfirmationSchema, companyIdentitySchema } from '../../shared/schemas';
import { notFound, RepositoryError, row, text, transaction } from './common';

export interface CompanyAliasesRepository {
  confirm(input: CompanyAliasConfirmation): CompanyAlias;
  remove(alias: string): void;
}

export function createCompanyAliasesRepository(db: DatabaseSync): CompanyAliasesRepository {
  return {
    confirm(input) {
      const parsed = companyAliasConfirmationSchema.parse(input);
      return transaction(db, () => {
        const aliasIsCanonical = db.prepare(`
          SELECT 1 FROM canonical_companies WHERE canonical_name = ?
        `).get(parsed.alias) !== undefined;
        const canonicalIsAlias = db.prepare(`
          SELECT 1 FROM company_aliases WHERE alias = ?
        `).get(parsed.canonicalName) !== undefined;
        if (aliasIsCanonical || canonicalIsAlias) {
          throw new RepositoryError(
            'VALIDATION_ERROR',
            'Choose a canonical company identity that is not already an alias',
          );
        }
        const now = new Date().toISOString();
        let canonical = db.prepare(`
          SELECT id FROM canonical_companies WHERE canonical_name = ?
        `).get(parsed.canonicalName);
        if (canonical === undefined) {
          const id = randomUUID();
          db.prepare(`
            INSERT INTO canonical_companies (id, canonical_name, created_at, updated_at)
            VALUES (?, ?, ?, ?)
          `).run(id, parsed.canonicalName, now, now);
          canonical = { id };
        }
        const canonicalId = text(row(canonical, 'canonical company').id, 'id');
        db.prepare(`
          INSERT INTO company_aliases (alias, canonical_company_id, created_at)
          VALUES (?, ?, ?)
          ON CONFLICT(alias) DO UPDATE SET canonical_company_id = excluded.canonical_company_id
        `).run(parsed.alias, canonicalId, now);
        return { ...parsed, createdAt: now };
      });
    },

    remove(alias) {
      const parsed = companyIdentitySchema.parse(alias);
      transaction(db, () => {
        const existing = db.prepare(`
          SELECT canonical_company_id FROM company_aliases WHERE alias = ?
        `).get(parsed);
        if (existing === undefined) notFound('Company alias', parsed);
        const canonicalId = text(row(existing, 'company alias').canonical_company_id, 'canonical_company_id');

        db.prepare('DELETE FROM company_aliases WHERE alias = ?').run(parsed);
        db.prepare(`
          DELETE FROM canonical_companies
          WHERE id = ?
            AND NOT EXISTS (
              SELECT 1 FROM company_aliases WHERE canonical_company_id = ?
            )
        `).run(canonicalId, canonicalId);
      });
    },
  };
}
