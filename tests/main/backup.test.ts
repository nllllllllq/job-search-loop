import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { copyFile, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../src/main/database';
import { registerSystemHandlers } from '../../src/main/ipc/system';
import {
  BackupServiceError,
  createBackupService,
  markerPathFor,
  readRestoreMarker,
  recoverInterruptedRestore,
  writeRestoreMarker,
  type LiveDatabaseController,
  type RestoreMarker,
} from '../../src/main/services/backup';
import { CURRENT_SCHEMA_VERSION } from '../../src/main/migrations';

const temporaryDirectories: string[] = [];
const openControllers: LiveDatabaseController[] = [];

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'job-loop-backup-'));
  temporaryDirectories.push(directory);
  const livePath = join(directory, 'live.sqlite');
  let database = openDatabase(livePath);
  const controller: LiveDatabaseController = {
    path: livePath,
    current: () => database,
    close: () => database.close(),
    reopen: () => {
      database = openDatabase(livePath);
      return database;
    },
  };
  openControllers.push(controller);
  return {
    directory,
    livePath,
    controller,
    service: createBackupService({ controller }),
    database: () => database,
  };
}

function seedClosedLoop(db: DatabaseSync): void {
  const now = '2026-07-27T08:00:00.000Z';
  const positionId = '11111111-1111-4111-8111-111111111111';
  const interviewId = '22222222-2222-4222-8222-222222222222';
  db.prepare(`
    INSERT INTO positions (
      id, company, title, interest, raw_jd, current_stage, final_result, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(positionId, '远山科技', 'AI 产品经理', 5, '负责 AI 产品规划', 'interview', null, now, now);
  db.prepare(`
    INSERT INTO preparation_materials (
      id, position_id, raw_jd_snapshot, prompt_snapshot, assets_snapshot,
      model_snapshot, output_snapshot, generated_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    '33333333-3333-4333-8333-333333333333',
    positionId,
    '负责 AI 产品规划',
    '准备提示词',
    '{"projects":[],"questions":[]}',
    'model-a',
    '{"roleSummary":"岗位摘要"}',
    now,
    now,
  );
  db.prepare(`
    INSERT INTO interviews (
      id, position_id, round_name, interview_date, transcript, personal_notes,
      summary, feedback_result, review_snapshot_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    interviewId,
    positionId,
    '一面',
    '2026-07-27',
    '面试记录',
    '个人感受',
    '复盘摘要',
    '进入下一轮',
    null,
    now,
    now,
  );
  db.prepare(`
    INSERT INTO projects (
      id, name, background, goal, role, key_decisions, outcomes_and_evidence,
      reflections, storytelling_versions, outcome, evidence, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    '44444444-4444-4444-8444-444444444444',
    'AI 助手',
    '背景',
    '目标',
    '产品经理',
    '决策',
    '旧聚合字段',
    '复盘',
    '讲述',
    '结果',
    '证据',
    now,
    now,
  );
  db.prepare(`
    INSERT INTO change_proposals (
      id, target_type, target_id, operation, payload_json, accepted_payload_json,
      rationale, position_id, interview_id, status, created_at, updated_at, resolved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    '55555555-5555-4555-8555-555555555555',
    'insight',
    null,
    'create',
    '{"title":"心得","content":"内容","positionId":null,"projectId":null,"questionId":null,"capabilityId":null}',
    '{"title":"心得","content":"内容","positionId":null,"projectId":null,"questionId":null,"capabilityId":null}',
    '复盘所得',
    positionId,
    interviewId,
    'accepted',
    now,
    now,
    now,
  );
}

function createLegacyBackup(path: string, version: 1 | 4): void {
  const db = openDatabase(path);
  try {
    seedClosedLoop(db);
    db.exec(`
      PRAGMA foreign_keys = OFF;
      ALTER TABLE change_proposals DROP COLUMN analysis_run_id;
      DROP TABLE capability_analysis_runs;
      ALTER TABLE positions DROP COLUMN location;
      ALTER TABLE projects DROP COLUMN unclassified_notes;
    `);
    if (version === 1) {
      db.exec(`
        ALTER TABLE projects DROP COLUMN outcome;
        ALTER TABLE projects DROP COLUMN evidence;
        ALTER TABLE interviews DROP COLUMN review_snapshot_json;
      `);
    }
    db.exec(`PRAGMA user_version = ${version};`);
  } finally {
    db.close();
  }
}

afterEach(async () => {
  for (const controller of openControllers.splice(0)) {
    try {
      controller.close();
    } catch {
      // A failure-path test may already have closed this handle.
    }
  }
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe('local database backup', () => {
  it('exports and restores the complete closed-loop records', async () => {
    const app = await fixture();
    seedClosedLoop(app.database());
    const backupPath = join(app.directory, '求职闭环.jobloop');
    const settingsPath = join(app.directory, 'ai-settings.json');
    writeFileSync(settingsPath, '{"encryptedKey":"never-in-backup-secret"}');

    await app.service.exportTo(backupPath);
    expect(readFileSync(backupPath).toString('latin1')).not.toContain(
      'never-in-backup-secret',
    );
    app.database().exec(`
      DELETE FROM change_proposals;
      DELETE FROM projects;
      DELETE FROM interviews;
      DELETE FROM preparation_materials;
      DELETE FROM positions;
    `);
    const restored = await app.service.restoreFrom(backupPath);

    expect(app.database().prepare('SELECT company FROM positions').get()).toEqual({
      company: '远山科技',
    });
    expect(app.database().prepare('SELECT COUNT(*) AS count FROM preparation_materials').get())
      .toEqual({ count: 1 });
    expect(app.database().prepare('SELECT COUNT(*) AS count FROM interviews').get())
      .toEqual({ count: 1 });
    expect(app.database().prepare('SELECT COUNT(*) AS count FROM projects').get())
      .toEqual({ count: 1 });
    expect(app.database().prepare(
      "SELECT COUNT(*) AS count FROM change_proposals WHERE status = 'accepted'",
    ).get()).toEqual({ count: 1 });
    expect(readFileSync(settingsPath, 'utf8')).toBe(
      '{"encryptedKey":"never-in-backup-secret"}',
    );
    expect('rollbackPath' in restored && existsSync(restored.rollbackPath)).toBe(true);
  });

  it.each([1, 4] as const)(
    'restores a complete V%i backup and migrates it to the current schema',
    async (version) => {
      const app = await fixture();
      const backupPath = join(app.directory, `legacy-v${version}.jobloop`);
      createLegacyBackup(backupPath, version);

      await expect(app.service.restoreFrom(backupPath)).resolves.toEqual({
        rollbackPath: expect.any(String),
      });
      expect(app.database().prepare('PRAGMA user_version').get())
        .toEqual({ user_version: CURRENT_SCHEMA_VERSION });
      expect(app.database().prepare(`
        SELECT location FROM positions
        WHERE id = '11111111-1111-4111-8111-111111111111'
      `).get()).toEqual({ location: '' });
      expect(app.database().prepare(`
        SELECT unclassified_notes FROM projects
        WHERE id = '44444444-4444-4444-8444-444444444444'
      `).get()).toEqual({ unclassified_notes: '' });
      expect(app.database().prepare(`
        SELECT COUNT(*) AS count FROM capability_analysis_runs
      `).get()).toEqual({ count: 0 });
    },
  );

  it('rejects a V4 backup missing a table required by that schema version', async () => {
    const app = await fixture();
    const backupPath = join(app.directory, 'legacy-v4-missing-table.jobloop');
    createLegacyBackup(backupPath, 4);
    const legacy = new DatabaseSync(backupPath);
    legacy.exec('DROP TABLE questions;');
    legacy.close();

    await expect(app.service.restoreFrom(backupPath)).rejects.toMatchObject({
      code: 'BACKUP_INVALID',
    });
    expect(app.database().prepare('PRAGMA user_version').get())
      .toEqual({ user_version: CURRENT_SCHEMA_VERSION });
  });

  it('rejects invalid and future-schema files without changing the live database', async () => {
    const app = await fixture();
    seedClosedLoop(app.database());
    const invalidPath = join(app.directory, 'invalid.jobloop');
    writeFileSync(invalidPath, 'not sqlite');

    await expect(app.service.restoreFrom(invalidPath)).rejects.toBeInstanceOf(
      BackupServiceError,
    );
    expect(app.database().prepare('SELECT company FROM positions').get()).toEqual({
      company: '远山科技',
    });

    const futurePath = join(app.directory, 'future.jobloop');
    const future = openDatabase(join(app.directory, 'future-source.sqlite'));
    future.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 1}`);
    future.close();
    writeFileSync(futurePath, readFileSync(join(app.directory, 'future-source.sqlite')));

    await expect(app.service.restoreFrom(futurePath)).rejects.toMatchObject({
      code: 'BACKUP_INVALID',
    });
    expect(app.database().prepare('SELECT company FROM positions').get()).toEqual({
      company: '远山科技',
    });

    const missingTablePath = join(app.directory, 'missing-table.jobloop');
    const missingTable = new DatabaseSync(missingTablePath);
    missingTable.exec(`
      CREATE TABLE positions (id TEXT PRIMARY KEY) STRICT;
      PRAGMA user_version = ${CURRENT_SCHEMA_VERSION};
    `);
    missingTable.close();
    await expect(app.service.restoreFrom(missingTablePath)).rejects.toMatchObject({
      code: 'BACKUP_INVALID',
    });
    expect(app.database().prepare('SELECT company FROM positions').get()).toEqual({
      company: '远山科技',
    });
  });

  it('rolls back the live file when reopening the restored database fails', async () => {
    const source = await fixture();
    seedClosedLoop(source.database());
    const backupPath = join(source.directory, 'source.jobloop');
    await source.service.exportTo(backupPath);
    source.database().close();

    const target = await fixture();
    target.database().prepare(`
      INSERT INTO positions (
        id, company, title, interest, raw_jd, current_stage, final_result, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      '66666666-6666-4666-8666-666666666666',
      '保留公司',
      '保留岗位',
      3,
      '原数据',
      'interested',
      null,
      '2026-07-27T08:00:00.000Z',
      '2026-07-27T08:00:00.000Z',
    );
    let firstReopen = true;
    let current = target.database();
    const controller: LiveDatabaseController = {
      path: target.livePath,
      current: () => current,
      close: () => current.close(),
      reopen: () => {
        if (firstReopen) {
          firstReopen = false;
          throw new Error('simulated reopen failure');
        }
        current = openDatabase(target.livePath);
        return current;
      },
    };
    openControllers.push(controller);
    const service = createBackupService({ controller });

    await expect(service.restoreFrom(backupPath)).rejects.toMatchObject({
      code: 'BACKUP_FAILED',
    });
    expect(current.prepare('SELECT company FROM positions').get()).toEqual({
      company: '保留公司',
    });
  });

  it('keeps native dialog cancellation side-effect free', async () => {
    const handlers = new Map<string, (event: unknown, payload?: unknown) => unknown>();
    const exportTo = vi.fn();
    const restoreFrom = vi.fn();
    const onRestoreCompleted = vi.fn();
    registerSystemHandlers(
      {
        handle(channel, handler) {
          handlers.set(channel, handler);
        },
      },
      { getSummary: vi.fn() },
      undefined,
      {
        backup: {
          exportTo,
          restoreFrom,
          getProgress: vi.fn().mockReturnValue({
            operation: 'idle',
            phase: 'idle',
            percent: 0,
            cancellable: false,
            active: false,
          }),
          cancel: vi.fn().mockReturnValue(false),
          listRollbacks: vi.fn().mockResolvedValue([]),
          checkRollback: vi.fn(),
          deleteRollback: vi.fn(),
        },
        dialogs: {
          chooseExportPath: vi.fn().mockResolvedValue(null),
          chooseRestorePath: vi.fn().mockResolvedValue(null),
        },
        onRestoreCompleted,
      },
    );

    await expect(handlers.get('system:backup:export')!({})).resolves.toEqual({
      status: 'cancelled',
    });
    await expect(handlers.get('system:backup:restore')!({})).resolves.toEqual({
      status: 'cancelled',
    });
    expect(exportTo).not.toHaveBeenCalled();
    expect(restoreFrom).not.toHaveBeenCalled();
    expect(onRestoreCompleted).not.toHaveBeenCalled();
  });

  it('records restore phases, reports progress, and clears the marker on success', async () => {
    const source = await fixture();
    seedClosedLoop(source.database());
    const backupPath = join(source.directory, 'source.jobloop');
    await source.service.exportTo(backupPath);

    const target = await fixture();
    const phases: string[] = [];
    const service = createBackupService({
      controller: target.controller,
      onProgress: (progress) => {
        if (progress.operation === 'restore') phases.push(progress.phase);
      },
    });

    await service.restoreFrom(backupPath);

    expect(phases).toEqual(expect.arrayContaining([
      'validating-source',
      'staging',
      'creating-rollback',
      'ready-to-replace',
      'replacing',
      'completed',
    ]));
    expect(service.getProgress()).toMatchObject({
      operation: 'restore',
      phase: 'completed',
      percent: 100,
      cancellable: false,
      active: false,
    });
    expect(existsSync(markerPathFor(target.livePath))).toBe(false);
  });

  it('can cancel restore before replacement without changing live data', async () => {
    const source = await fixture();
    seedClosedLoop(source.database());
    const backupPath = join(source.directory, 'source.jobloop');
    await source.service.exportTo(backupPath);

    const target = await fixture();
    target.database().prepare(`
      INSERT INTO positions (
        id, company, title, interest, raw_jd, current_stage, final_result, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      '77777777-7777-4777-8777-777777777777',
      '取消后保留',
      '产品经理',
      3,
      '原始数据',
      'interested',
      null,
      '2026-07-28T08:00:00.000Z',
      '2026-07-28T08:00:00.000Z',
    );
    let service!: ReturnType<typeof createBackupService>;
    service = createBackupService({
      controller: target.controller,
      onProgress: (progress) => {
        if (progress.phase === 'ready-to-replace') service.cancel();
      },
    });

    await expect(service.restoreFrom(backupPath)).resolves.toEqual({
      status: 'cancelled',
    });
    expect(target.database().prepare('SELECT company FROM positions').get())
      .toEqual({ company: '取消后保留' });
    expect(existsSync(markerPathFor(target.livePath))).toBe(false);
  });

  it('resolves interrupted restore by continuing, rolling back, or preserving files', async () => {
    const source = await fixture();
    seedClosedLoop(source.database());
    const replacementPath = join(source.directory, 'replacement.jobloop');
    await source.service.exportTo(replacementPath);
    source.controller.close();

    for (const choice of ['continue', 'rollback', 'preserve'] as const) {
      const directory = await mkdtemp(join(tmpdir(), `job-loop-recovery-${choice}-`));
      temporaryDirectories.push(directory);
      const livePath = join(directory, 'live.sqlite');
      const stagedPath = join(directory, '.live.sqlite.restore.tmp');
      const rollbackPath = join(directory, 'live.sqlite.rollback-safe.jobloop');
      await copyFile(replacementPath, stagedPath);
      await copyFile(replacementPath, rollbackPath);
      if (choice !== 'continue') await copyFile(replacementPath, livePath);
      const marker: RestoreMarker = {
        version: 1,
        phase: choice === 'continue' ? 'live-displaced' : 'replacement-installed',
        livePath,
        stagedPath,
        rollbackPath,
        startedAt: '2026-07-28T08:00:00.000Z',
      };
      await writeRestoreMarker(marker);

      await expect(recoverInterruptedRestore(livePath, choice)).resolves.toBe(choice);
      expect(await readRestoreMarker(livePath)).toBeNull();
      if (choice !== 'preserve') expect(existsSync(livePath)).toBe(true);
      if (choice === 'preserve') {
        expect((await readdir(directory)).some((name) => name.includes('restore-preserved')))
          .toBe(true);
      }
    }
  });

  it('keeps the newest three validated rollbacks and safely deletes by opaque id', async () => {
    const app = await fixture();
    seedClosedLoop(app.database());
    for (let index = 0; index < 4; index += 1) {
      const backupPath = join(app.directory, `source-${index}.jobloop`);
      await app.service.exportTo(backupPath);
      await app.service.restoreFrom(backupPath);
    }

    const rollbacks = await app.service.listRollbacks();
    expect(rollbacks).toHaveLength(3);
    expect(rollbacks.every((item) => !('path' in item))).toBe(true);
    await expect(app.service.deleteRollback('../live.sqlite')).rejects.toMatchObject({
      code: 'BACKUP_INVALID',
    });
    await expect(app.service.checkRollback(rollbacks[0].id, true)).resolves.toMatchObject({
      deepStatus: 'valid',
    });
    await app.service.deleteRollback(rollbacks[0].id);
    expect(await app.service.listRollbacks()).toHaveLength(2);
  });
});
