import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { PreparationMaterial } from '../../shared/domain';
import { preparationInputSchema } from '../../shared/schemas';
import { notFound, row, text } from './common';

export type PreparationInput = Omit<PreparationMaterial, 'id' | 'createdAt'>;

function decodePreparation(value: unknown): PreparationMaterial {
  const data = row(value, 'preparation');
  return {
    id: text(data.id, 'id'),
    positionId: text(data.position_id, 'position_id'),
    rawJdSnapshot: text(data.raw_jd_snapshot, 'raw_jd_snapshot'),
    promptSnapshot: text(data.prompt_snapshot, 'prompt_snapshot'),
    assetsSnapshot: text(data.assets_snapshot, 'assets_snapshot'),
    modelSnapshot: text(data.model_snapshot, 'model_snapshot'),
    outputSnapshot: text(data.output_snapshot, 'output_snapshot'),
    generatedAt: text(data.generated_at, 'generated_at'),
    createdAt: text(data.created_at, 'created_at'),
  };
}

export interface PreparationsRepository {
  create(input: PreparationInput): PreparationMaterial;
  get(id: string): PreparationMaterial;
  listByPosition(positionId: string): PreparationMaterial[];
}

export function createPreparationsRepository(db: DatabaseSync): PreparationsRepository {
  const get = (id: string): PreparationMaterial => {
    const value = db.prepare('SELECT * FROM preparation_materials WHERE id = ?').get(id);
    if (value === undefined) notFound('Preparation', id);
    return decodePreparation(value);
  };
  return {
    create(input) {
      const parsed = preparationInputSchema.parse(input);
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      db.prepare(`
        INSERT INTO preparation_materials (
          id, position_id, raw_jd_snapshot, prompt_snapshot, assets_snapshot,
          model_snapshot, output_snapshot, generated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        parsed.positionId,
        parsed.rawJdSnapshot,
        parsed.promptSnapshot,
        parsed.assetsSnapshot,
        parsed.modelSnapshot,
        parsed.outputSnapshot,
        parsed.generatedAt,
        createdAt,
      );
      return get(id);
    },
    get,
    listByPosition(positionId) {
      return db.prepare(`
        SELECT * FROM preparation_materials
        WHERE position_id = ? ORDER BY generated_at DESC, created_at DESC
      `).all(positionId).map(decodePreparation);
    },
  };
}
