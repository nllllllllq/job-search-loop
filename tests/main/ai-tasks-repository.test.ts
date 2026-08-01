// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createAiTasksRepository } from '../../src/main/repositories/ai-tasks';
import { createPositionsRepository } from '../../src/main/repositories/positions';
import { createTestDatabase } from '../helpers/database';

describe('AI tasks repository', () => {
  it('persists only a preparation task lifecycle and safe error metadata', () => {
    const db = createTestDatabase();

    try {
      const position = createPositionsRepository(db).create({
        company: 'Example Co',
        title: 'Product Manager',
        interest: 3,
        rawJd: 'Sensitive JD must not be stored in a task.',
      });
      const tasks = createAiTasksRepository(db);

      const queued = tasks.createPreparation(position.id);
      expect(queued).toMatchObject({
        kind: 'preparation', positionId: position.id, status: 'queued', safeError: null, startedAt: null,
      });

      expect(tasks.markRunning(queued.id)).toMatchObject({ status: 'running', startedAt: expect.any(String) });
      expect(tasks.markFailed(queued.id, {
        message: 'Provider rejected the request', statusCode: 401, requestId: 'req_123',
      })).toMatchObject({
        status: 'failed',
        safeError: {
          message: 'Provider rejected the request', statusCode: 401, requestId: 'req_123',
        },
      });

      const row = db.prepare('SELECT * FROM ai_tasks WHERE id = ?').get(queued.id) as Record<string, unknown>;
      expect(Object.keys(row).sort()).toEqual([
        'created_at', 'id', 'kind', 'position_id', 'safe_error_json', 'started_at', 'status', 'updated_at',
      ]);
      expect(JSON.stringify(row)).not.toContain('Sensitive JD');
      expect(JSON.stringify(row)).not.toContain('prompt');
      expect(JSON.stringify(row)).not.toContain('assets');
      expect(JSON.stringify(row)).not.toContain('bytes');
    } finally {
      db.close();
    }
  });

  it('allows only the preparation task state transitions used by the runtime', () => {
    const db = createTestDatabase();

    try {
      const position = createPositionsRepository(db).create({
        company: 'Example Co', title: 'Product Manager', interest: 3, rawJd: 'JD',
      });
      const tasks = createAiTasksRepository(db);
      const queued = tasks.createPreparation(position.id);
      const terminal = tasks.createPreparation(position.id);

      expect(() => tasks.markSucceeded(queued.id)).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
      tasks.markRunning(terminal.id);
      tasks.markSucceeded(terminal.id);
      expect(() => tasks.markRunning(terminal.id)).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
      expect(() => tasks.markFailed(terminal.id, {
        message: 'late failure', statusCode: null, requestId: null,
      })).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
    } finally {
      db.close();
    }
  });

  it('redacts sensitive error echoes before task diagnostics are persisted', () => {
    const db = createTestDatabase();

    try {
      const position = createPositionsRepository(db).create({
        company: 'Example Co', title: 'Product Manager', interest: 3, rawJd: 'private JD sentence',
      });
      const tasks = createAiTasksRepository(db);
      const task = tasks.createPreparation(position.id);
      tasks.markRunning(task.id);
      tasks.markFailed(task.id, {
        message: 'Authorization: Bearer sk-secret\nPrompt: private prompt\nJD: private JD sentence\nProvider rejected request',
        statusCode: 400,
        requestId: 'req_123',
      });

      const stored = String((db.prepare('SELECT safe_error_json FROM ai_tasks WHERE id = ?').get(task.id) as {
        safe_error_json: string;
      }).safe_error_json);
      expect(stored).not.toContain('sk-secret');
      expect(stored).not.toContain('private prompt');
      expect(stored).not.toContain('private JD sentence');
      expect(stored).toContain('AI service returned an unsafe diagnostic payload');
      const invalidDiagnostic = tasks.createPreparation(position.id);
      tasks.markRunning(invalidDiagnostic.id);
      expect(() => tasks.markFailed(invalidDiagnostic.id, {
        message: 'request id too long', statusCode: 400, requestId: 'x'.repeat(501),
      })).toThrow();
    } finally {
      db.close();
    }
  });

  it('suppresses same-line structured request echoes in diagnostics', () => {
    const db = createTestDatabase();

    try {
      const position = createPositionsRepository(db).create({
        company: 'Example Co', title: 'Product Manager', interest: 3, rawJd: 'private JD',
      });
      const tasks = createAiTasksRepository(db);
      const task = tasks.createPreparation(position.id);
      tasks.markRunning(task.id);
      tasks.markFailed(task.id, {
        message: 'Provider error; request body: {"prompt":"private prompt","input":"private JD","assets":"private assets"}',
        statusCode: 400,
        requestId: 'req_123',
      });

      const stored = String((db.prepare('SELECT safe_error_json FROM ai_tasks WHERE id = ?').get(task.id) as {
        safe_error_json: string;
      }).safe_error_json);
      expect(stored).not.toContain('private prompt');
      expect(stored).not.toContain('private JD');
      expect(stored).not.toContain('private assets');
      expect(stored).toContain('AI service returned an unsafe diagnostic payload');
    } finally {
      db.close();
    }
  });

  it('marks queued and running preparation tasks interrupted on startup', () => {
    const db = createTestDatabase();

    try {
      const position = createPositionsRepository(db).create({
        company: 'Example Co', title: 'Product Manager', interest: 3, rawJd: 'JD',
      });
      const tasks = createAiTasksRepository(db);
      const queued = tasks.createPreparation(position.id);
      const running = tasks.createPreparation(position.id);
      const succeeded = tasks.createPreparation(position.id);
      tasks.markRunning(running.id);
      tasks.markRunning(succeeded.id);
      tasks.markSucceeded(succeeded.id);

      expect(tasks.interruptRunningOnStartup()).toBe(2);
      expect(tasks.get(queued.id).status).toBe('interrupted');
      expect(tasks.get(running.id).status).toBe('interrupted');
      expect(tasks.get(succeeded.id).status).toBe('succeeded');
    } finally {
      db.close();
    }
  });
});
