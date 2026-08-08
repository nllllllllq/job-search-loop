// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createAiTasksRepository } from '../../src/main/repositories/ai-tasks';
import { createPositionsRepository } from '../../src/main/repositories/positions';
import { createPreparationTaskRuntime } from '../../src/main/services/preparation-tasks';
import { AiServiceError } from '../../src/main/services/ai-settings';
import { createTestDatabase } from '../helpers/database';

const input = {
  positionId: '11111111-1111-4111-8111-111111111111',
};

describe('background preparation tasks', () => {
  it('returns a queued task immediately then records successful generation', async () => {
    const db = createTestDatabase();
    try {
      const position = createPositionsRepository(db).create({
        company: 'Example Co', title: 'PM', interest: 3, rawJd: 'JD',
      });
      const generate = vi.fn(async () => ({}) as never);
      const scheduled: Array<() => void> = [];
      const runtime = createPreparationTaskRuntime({
        tasks: createAiTasksRepository(db),
        preparation: { generate },
        schedule: (job) => scheduled.push(job),
      });

      const task = runtime.start({ ...input, positionId: position.id });
      expect(task.status).toBe('queued');
      expect(generate).not.toHaveBeenCalled();
      expect(runtime.get(task.id).status).toBe('queued');

      scheduled.shift()?.();

      await runtime.drainForTest();
      expect(runtime.get(task.id).status).toBe('succeeded');
      expect(generate).toHaveBeenCalledWith({ ...input, positionId: position.id });
    } finally { db.close(); }
  });

  it('persists only safe diagnostics when generation fails and creates no material', async () => {
    const db = createTestDatabase();
    try {
      const position = createPositionsRepository(db).create({
        company: 'Example Co', title: 'PM', interest: 3, rawJd: 'private JD',
      });
      const runtime = createPreparationTaskRuntime({
        tasks: createAiTasksRepository(db),
        preparation: { generate: async () => {
          throw new AiServiceError(
            'AI_PROVIDER_ERROR',
            'Provider rejected request',
            'The request contains: private JD sentence',
            400,
            'req_1',
          );
        } },
      });
      const task = runtime.start({ ...input, positionId: position.id });
      await runtime.drainForTest();

      expect(runtime.get(task.id)).toMatchObject({
        status: 'failed', safeError: {
          message: 'AI service returned an unsafe diagnostic payload', statusCode: 400, requestId: 'req_1',
        },
      });
      expect(db.prepare('SELECT COUNT(*) AS count FROM preparation_materials').get()).toEqual({ count: 0 });
      expect(JSON.stringify(db.prepare('SELECT * FROM ai_tasks WHERE id = ?').get(task.id))).not.toContain('private JD');
    } finally { db.close(); }
  });

  it('rejects a second queued preparation for the same position without scheduling duplicate work', () => {
    const db = createTestDatabase();
    try {
      const position = createPositionsRepository(db).create({
        company: 'Example Co', title: 'PM', interest: 3, rawJd: 'JD',
      });
      const scheduled: Array<() => void> = [];
      const generate = vi.fn(async () => ({}) as never);
      const runtime = createPreparationTaskRuntime({
        tasks: createAiTasksRepository(db),
        preparation: { generate },
        schedule: (job) => scheduled.push(job),
      });

      const first = runtime.start({ ...input, positionId: position.id });
      expect(() => runtime.start({ ...input, positionId: position.id }))
        .toThrow(expect.objectContaining({ code: 'CONFLICT' }));
      expect(runtime.get(first.id).status).toBe('queued');
      expect(scheduled).toHaveLength(1);
      expect(generate).not.toHaveBeenCalled();
    } finally { db.close(); }
  });

  it('keeps a benign provider diagnostic with its status and request ID', async () => {
    const db = createTestDatabase();
    try {
      const position = createPositionsRepository(db).create({
        company: 'Example Co', title: 'PM', interest: 3, rawJd: 'JD',
      });
      const runtime = createPreparationTaskRuntime({
        tasks: createAiTasksRepository(db),
        preparation: { generate: async () => {
          throw new AiServiceError('AI_PROVIDER_ERROR', 'Provider rejected request', 'Unknown model name', 400, 'req_2');
        } },
      });
      const task = runtime.start({ ...input, positionId: position.id });
      await runtime.drainForTest();

      expect(runtime.get(task.id).safeError).toEqual({
        message: 'Unknown model name', statusCode: 400, requestId: 'req_2',
      });
    } finally { db.close(); }
  });
});
