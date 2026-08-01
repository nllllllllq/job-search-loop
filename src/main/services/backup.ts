import { randomUUID } from 'node:crypto';
import {
  copyFile,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  backup as sqliteBackup,
  DatabaseSync,
} from 'node:sqlite';
import { CURRENT_SCHEMA_VERSION } from '../migrations';

const REQUIRED_TABLES_V1_TO_V4 = [
  'asset_versions',
  'capabilities',
  'capability_evidence',
  'change_proposals',
  'insights',
  'interviews',
  'positions',
  'preparation_materials',
  'process_stages',
  'projects',
  'prompt_templates',
  'questions',
] as const;

const REQUIRED_TABLES_V5_PLUS = [
  ...REQUIRED_TABLES_V1_TO_V4,
  'capability_analysis_runs',
].sort();

const REQUIRED_TABLES_V7_PLUS = [
  ...REQUIRED_TABLES_V5_PLUS,
  'ai_tasks',
].sort();

function requiredTablesForVersion(version: number): readonly string[] {
  if (version >= 7) return REQUIRED_TABLES_V7_PLUS;
  return version >= 5 ? REQUIRED_TABLES_V5_PLUS : REQUIRED_TABLES_V1_TO_V4;
}

export type BackupServiceErrorCode = 'BACKUP_INVALID' | 'BACKUP_FAILED';

export class BackupServiceError extends Error {
  constructor(
    public readonly code: BackupServiceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BackupServiceError';
  }
}

export interface LiveDatabaseController {
  readonly path: string;
  current(): DatabaseSync;
  close(): void;
  reopen(): DatabaseSync;
}

export interface RestoreResult {
  rollbackPath: string;
}

export type RestorePhase =
  | 'staged'
  | 'live-closed'
  | 'live-displaced'
  | 'replacement-installed';

export interface RestoreMarker {
  version: 1;
  phase: RestorePhase;
  livePath: string;
  stagedPath: string;
  rollbackPath: string;
  startedAt: string;
}

export type BackupProgress = {
  operation: 'idle' | 'export' | 'restore' | 'deep-check';
  phase: string;
  percent: number;
  cancellable: boolean;
  active: boolean;
};

export type RollbackSummary = {
  id: string;
  label: string;
  createdAt: string;
  size: number;
  quickStatus: 'valid';
  deepStatus: 'unchecked' | 'valid';
};

export interface BackupService {
  exportTo(destinationPath: string): Promise<void>;
  restoreFrom(
    sourcePath: string,
    options?: { deepCheck?: boolean },
  ): Promise<RestoreResult | { status: 'cancelled' }>;
  getProgress(): BackupProgress;
  cancel(): boolean;
  listRollbacks(): Promise<RollbackSummary[]>;
  checkRollback(id: string, deep: boolean): Promise<RollbackSummary>;
  deleteRollback(id: string): Promise<void>;
}

interface BackupServiceDependencies {
  controller: LiveDatabaseController;
  backup?: typeof sqliteBackup;
  now?: () => Date;
  onProgress?: (progress: BackupProgress) => void;
}

function scalarText(row: unknown): string | null {
  if (row === null || typeof row !== 'object') return null;
  const values = Object.values(row);
  return values.length === 1 && typeof values[0] === 'string'
    ? values[0]
    : null;
}

function scalarNumber(row: unknown): number | null {
  if (row === null || typeof row !== 'object') return null;
  const values = Object.values(row);
  return values.length === 1 && typeof values[0] === 'number'
    ? values[0]
    : null;
}

export function validateBackupFile(path: string, deep = false): void {
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(path, {
      readOnly: true,
      timeout: 5_000,
    });
    database.exec('PRAGMA query_only = ON');
    const version = scalarNumber(database.prepare('PRAGMA user_version').get());
    if (
      version === null
      || !Number.isSafeInteger(version)
      || version < 1
      || version > CURRENT_SCHEMA_VERSION
    ) {
      throw new BackupServiceError(
        'BACKUP_INVALID',
        '所选文件不是当前版本支持的求职闭环备份。',
      );
    }

    const tableRows = database.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
    const tables = tableRows.map((row) => (
      row !== null
      && typeof row === 'object'
      && 'name' in row
      && typeof row.name === 'string'
        ? row.name
        : ''
    ));
    const requiredTables = requiredTablesForVersion(version);
    if (
      tables.length !== requiredTables.length
      || requiredTables.some((table, index) => tables[index] !== table)
    ) {
      throw new BackupServiceError(
        'BACKUP_INVALID',
        '备份文件缺少必要的数据表，或包含不受支持的结构。',
      );
    }

    const integrity = scalarText(database.prepare(
      deep ? 'PRAGMA integrity_check' : 'PRAGMA quick_check',
    ).get());
    if (integrity !== 'ok') {
      throw new BackupServiceError(
        'BACKUP_INVALID',
        '备份文件完整性校验失败。',
      );
    }
  } catch (error) {
    if (error instanceof BackupServiceError) throw error;
    throw new BackupServiceError(
      'BACKUP_INVALID',
      '所选文件不是有效的求职闭环备份。',
      { cause: error },
    );
  } finally {
    try {
      database?.close();
    } catch {
      // The validation result is more useful than a close error.
    }
  }
}

export function markerPathFor(livePath: string): string {
  return `${resolve(livePath)}.restore-marker.json`;
}

function displacedPathFor(livePath: string): string {
  return `${resolve(livePath)}.restore-displaced`;
}

function isRestorePhase(value: unknown): value is RestorePhase {
  return value === 'staged'
    || value === 'live-closed'
    || value === 'live-displaced'
    || value === 'replacement-installed';
}

function parseRestoreMarker(value: unknown, expectedLivePath: string): RestoreMarker {
  if (
    value === null
    || typeof value !== 'object'
    || !('version' in value)
    || value.version !== 1
    || !('phase' in value)
    || !isRestorePhase(value.phase)
    || !('livePath' in value)
    || typeof value.livePath !== 'string'
    || resolve(value.livePath) !== resolve(expectedLivePath)
    || !('stagedPath' in value)
    || typeof value.stagedPath !== 'string'
    || !('rollbackPath' in value)
    || typeof value.rollbackPath !== 'string'
    || !('startedAt' in value)
    || typeof value.startedAt !== 'string'
  ) {
    throw new BackupServiceError('BACKUP_INVALID', '恢复事务标记无效。');
  }
  const directory = resolve(dirname(expectedLivePath));
  if (
    resolve(dirname(value.stagedPath)) !== directory
    || resolve(dirname(value.rollbackPath)) !== directory
  ) {
    throw new BackupServiceError('BACKUP_INVALID', '恢复事务路径超出应用数据目录。');
  }
  return value as RestoreMarker;
}

async function replaceMarkerFile(temporaryPath: string, markerPath: string): Promise<void> {
  try {
    await rename(temporaryPath, markerPath);
  } catch (error) {
    if (
      error !== null
      && typeof error === 'object'
      && 'code' in error
      && (error.code === 'EEXIST' || error.code === 'EPERM')
    ) {
      await rm(markerPath, { force: true });
      await rename(temporaryPath, markerPath);
      return;
    }
    throw error;
  }
}

export async function writeRestoreMarker(marker: RestoreMarker): Promise<void> {
  const checked = parseRestoreMarker(marker, marker.livePath);
  const path = markerPathFor(checked.livePath);
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(checked), {
      encoding: 'utf8',
      flag: 'wx',
    });
    await replaceMarkerFile(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function readRestoreMarker(livePath: string): Promise<RestoreMarker | null> {
  const path = markerPathFor(livePath);
  try {
    return parseRestoreMarker(
      JSON.parse(await readFile(path, 'utf8')) as unknown,
      livePath,
    );
  } catch (error) {
    if (
      error !== null
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'ENOENT'
    ) {
      return null;
    }
    if (error instanceof BackupServiceError) throw error;
    throw new BackupServiceError('BACKUP_INVALID', '恢复事务标记无法读取。', {
      cause: error,
    });
  }
}

function siblingTemporaryPath(targetPath: string, label: string): string {
  return join(
    dirname(targetPath),
    `.${basename(targetPath)}.${label}-${randomUUID()}.tmp`,
  );
}

async function renameIfPresent(sourcePath: string, destinationPath: string): Promise<boolean> {
  try {
    await rename(sourcePath, destinationPath);
    return true;
  } catch (error) {
    if (
      error !== null
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'ENOENT'
    ) {
      return false;
    }
    throw error;
  }
}

async function replaceFileAtomically(
  stagedPath: string,
  destinationPath: string,
): Promise<void> {
  const displacedPath = siblingTemporaryPath(destinationPath, 'displaced');
  let displaced = false;
  try {
    try {
      await rename(destinationPath, displacedPath);
      displaced = true;
    } catch (error) {
      if (
        error === null
        || typeof error !== 'object'
        || !('code' in error)
        || error.code !== 'ENOENT'
      ) {
        throw error;
      }
    }
    await rename(stagedPath, destinationPath);
    if (displaced) {
      await rm(displacedPath, { force: true });
      displaced = false;
    }
  } catch (error) {
    if (displaced) {
      try {
        await rename(displacedPath, destinationPath);
        displaced = false;
      } catch {
        // The caller retains its independently validated rollback copy.
      }
    }
    throw error;
  } finally {
    if (!displaced) {
      await rm(displacedPath, { force: true }).catch(() => undefined);
    }
  }
}

function rollbackName(livePath: string, now: Date): string {
  const stamp = now.toISOString().replaceAll(':', '-').replaceAll('.', '-');
  return join(
    dirname(livePath),
    `${basename(livePath)}.rollback-${stamp}-${randomUUID()}.jobloop`,
  );
}

export type InterruptedRestoreChoice = 'continue' | 'rollback' | 'preserve';

export async function recoverInterruptedRestore(
  livePathInput: string,
  choice: InterruptedRestoreChoice,
): Promise<InterruptedRestoreChoice | 'none'> {
  const livePath = resolve(livePathInput);
  const marker = await readRestoreMarker(livePath);
  if (marker === null) return 'none';
  const markerPath = markerPathFor(livePath);
  const displacedPath = displacedPathFor(livePath);

  if (choice === 'preserve') {
    const preservedPath = `${markerPath}.restore-preserved-${Date.now()}.json`;
    await rename(markerPath, preservedPath);
    return choice;
  }

  if (choice === 'rollback') {
    validateBackupFile(marker.rollbackPath);
    const recoveryPath = siblingTemporaryPath(livePath, 'startup-rollback');
    try {
      await copyFile(marker.rollbackPath, recoveryPath);
      validateBackupFile(recoveryPath);
      await replaceFileAtomically(recoveryPath, livePath);
      validateBackupFile(livePath);
    } finally {
      await rm(recoveryPath, { force: true }).catch(() => undefined);
    }
  } else {
    let liveAlreadyInstalled = false;
    if (marker.phase === 'replacement-installed') {
      try {
        validateBackupFile(livePath);
        liveAlreadyInstalled = true;
      } catch {
        liveAlreadyInstalled = false;
      }
    }
    if (!liveAlreadyInstalled) {
      validateBackupFile(marker.stagedPath);
      await rm(displacedPath, { force: true });
      await renameIfPresent(livePath, displacedPath);
      await rename(marker.stagedPath, livePath);
      validateBackupFile(livePath);
    }
  }

  await rm(marker.stagedPath, { force: true });
  await rm(displacedPath, { force: true });
  await rm(markerPath, { force: true });
  return choice;
}

export function createBackupService(
  dependencies: BackupServiceDependencies,
): BackupService {
  const {
    controller,
    backup = sqliteBackup,
    now = () => new Date(),
    onProgress,
  } = dependencies;

  let progress: BackupProgress = {
    operation: 'idle',
    phase: 'idle',
    percent: 0,
    cancellable: false,
    active: false,
  };
  let cancelRequested = false;
  let active = false;
  const deepChecked = new Set<string>();

  const updateProgress = (next: BackupProgress) => {
    progress = next;
    onProgress?.(next);
  };

  const rollbackPrefix = `${basename(controller.path)}.rollback-`;
  const rollbackPathById = async (id: string): Promise<string> => {
    const entries = await readdir(dirname(controller.path));
    if (
      id.includes('/')
      || id.includes('\\')
      || !id.startsWith(rollbackPrefix)
      || !id.endsWith('.jobloop')
      || !entries.includes(id)
    ) {
      throw new BackupServiceError('BACKUP_INVALID', '回滚副本不存在或标识无效。');
    }
    const path = resolve(dirname(controller.path), id);
    if (resolve(dirname(path)) !== resolve(dirname(controller.path))) {
      throw new BackupServiceError('BACKUP_INVALID', '回滚副本路径无效。');
    }
    return path;
  };

  const listValidatedRollbacks = async (): Promise<Array<RollbackSummary & { path: string }>> => {
    const entries = await readdir(dirname(controller.path));
    const rollbacks: Array<RollbackSummary & { path: string }> = [];
    for (const id of entries.filter((name) => (
      name.startsWith(rollbackPrefix) && name.endsWith('.jobloop')
    ))) {
      const path = resolve(dirname(controller.path), id);
      try {
        validateBackupFile(path);
        const details = await stat(path);
        rollbacks.push({
          id,
          label: `恢复前副本 · ${details.mtime.toLocaleString('zh-CN')}`,
          createdAt: details.mtime.toISOString(),
          size: details.size,
          quickStatus: 'valid',
          deepStatus: deepChecked.has(id) ? 'valid' : 'unchecked',
          path,
        });
      } catch {
        // Invalid rollback-like files are deliberately not exposed to renderer.
      }
    }
    return rollbacks.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  };

  const retainNewestRollbacks = async () => {
    const rollbacks = await listValidatedRollbacks();
    await Promise.all(
      rollbacks.slice(3).map((item) => rm(item.path, { force: true })),
    );
  };

  return {
    async exportTo(destinationPath) {
      const destination = resolve(destinationPath);
      if (destination === resolve(controller.path)) {
        throw new BackupServiceError(
          'BACKUP_FAILED',
          '备份文件不能覆盖当前使用中的数据库。',
        );
      }
      if (active) {
        throw new BackupServiceError('BACKUP_FAILED', '已有备份或恢复操作正在进行。');
      }
      active = true;
      cancelRequested = false;
      updateProgress({
        operation: 'export',
        phase: 'exporting',
        percent: 20,
        cancellable: false,
        active: true,
      });
      const temporaryPath = siblingTemporaryPath(destination, 'export');
      try {
        await backup(controller.current(), temporaryPath);
        if (cancelRequested) return;
        validateBackupFile(temporaryPath);
        updateProgress({
          operation: 'export',
          phase: 'replacing',
          percent: 80,
          cancellable: false,
          active: true,
        });
        await replaceFileAtomically(temporaryPath, destination);
        updateProgress({
          operation: 'export',
          phase: 'completed',
          percent: 100,
          cancellable: false,
          active: false,
        });
      } catch (error) {
        if (error instanceof BackupServiceError) throw error;
        throw new BackupServiceError(
          'BACKUP_FAILED',
          '导出备份失败，当前业务数据没有被修改。',
          { cause: error },
        );
      } finally {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
        active = false;
        cancelRequested = false;
      }
    },

    async restoreFrom(sourcePath, options) {
      const livePath = resolve(controller.path);
      const source = resolve(sourcePath);
      if (source === livePath) {
        throw new BackupServiceError(
          'BACKUP_INVALID',
          '不能从当前使用中的数据库执行恢复。',
        );
      }
      if (active) {
        throw new BackupServiceError('BACKUP_FAILED', '已有备份或恢复操作正在进行。');
      }
      active = true;
      cancelRequested = false;

      const stagedPath = siblingTemporaryPath(livePath, 'restore');
      const rollbackPath = rollbackName(livePath, now());
      const displacedPath = displacedPathFor(livePath);
      const marker: RestoreMarker = {
        version: 1,
        phase: 'staged',
        livePath,
        stagedPath,
        rollbackPath,
        startedAt: now().toISOString(),
      };
      let liveClosed = false;
      let replacementStarted = false;
      try {
        updateProgress({
          operation: 'restore',
          phase: 'validating-source',
          percent: 10,
          cancellable: true,
          active: true,
        });
        validateBackupFile(source, options?.deepCheck === true);
        updateProgress({
          operation: 'restore',
          phase: 'staging',
          percent: 30,
          cancellable: true,
          active: true,
        });
        await copyFile(source, stagedPath);
        validateBackupFile(stagedPath);

        updateProgress({
          operation: 'restore',
          phase: 'creating-rollback',
          percent: 50,
          cancellable: true,
          active: true,
        });
        await backup(controller.current(), rollbackPath);
        validateBackupFile(rollbackPath);

        await writeRestoreMarker(marker);
        updateProgress({
          operation: 'restore',
          phase: 'ready-to-replace',
          percent: 65,
          cancellable: true,
          active: true,
        });
        if (cancelRequested) {
          await rm(markerPathFor(livePath), { force: true });
          await rm(stagedPath, { force: true });
          await rm(rollbackPath, { force: true });
          updateProgress({
            operation: 'restore',
            phase: 'cancelled',
            percent: 65,
            cancellable: false,
            active: false,
          });
          return { status: 'cancelled' };
        }

        marker.phase = 'live-closed';
        await writeRestoreMarker(marker);
        controller.close();
        liveClosed = true;
        await rm(`${livePath}-wal`, { force: true });
        await rm(`${livePath}-shm`, { force: true });
        replacementStarted = true;

        marker.phase = 'live-displaced';
        await writeRestoreMarker(marker);
        await rm(displacedPath, { force: true });
        await renameIfPresent(livePath, displacedPath);

        marker.phase = 'replacement-installed';
        await writeRestoreMarker(marker);
        updateProgress({
          operation: 'restore',
          phase: 'replacing',
          percent: 80,
          cancellable: false,
          active: true,
        });
        await rename(stagedPath, livePath);
        controller.reopen();
        liveClosed = false;
        await rm(displacedPath, { force: true });
        await rm(markerPathFor(livePath), { force: true });
        await retainNewestRollbacks();
        updateProgress({
          operation: 'restore',
          phase: 'completed',
          percent: 100,
          cancellable: false,
          active: false,
        });
        return { rollbackPath };
      } catch (error) {
        if (replacementStarted) {
          try {
            if (!liveClosed) {
              controller.close();
              liveClosed = true;
            }
          } catch {
            // Continue with the independently validated rollback file.
          }
          try {
            await recoverInterruptedRestore(livePath, 'rollback');
            controller.reopen();
            liveClosed = false;
          } catch (rollbackError) {
            throw new BackupServiceError(
              'BACKUP_FAILED',
              '恢复失败，且原数据库无法自动重新打开。',
              { cause: rollbackError },
            );
          }
        } else if (liveClosed) {
          try {
            controller.reopen();
            liveClosed = false;
          } catch (reopenError) {
            throw new BackupServiceError(
              'BACKUP_FAILED',
              '恢复未完成，原数据库暂时无法重新打开。',
              { cause: reopenError },
            );
          }
        }

        updateProgress({
          operation: 'restore',
          phase: 'failed',
          percent: 0,
          cancellable: false,
          active: false,
        });
        if (error instanceof BackupServiceError) throw error;
        throw new BackupServiceError(
          'BACKUP_FAILED',
          '恢复失败，已保留恢复前的数据。',
          { cause: error },
        );
      } finally {
        await rm(stagedPath, { force: true }).catch(() => undefined);
        if (!replacementStarted) {
          await rm(markerPathFor(livePath), { force: true }).catch(() => undefined);
        }
        active = false;
        cancelRequested = false;
      }
    },

    getProgress() {
      return { ...progress };
    },

    cancel() {
      if (!active || !progress.cancellable) return false;
      cancelRequested = true;
      return true;
    },

    async listRollbacks() {
      await retainNewestRollbacks();
      const items = await listValidatedRollbacks();
      return items.map(({ path: _path, ...item }) => item);
    },

    async checkRollback(id, deep) {
      const path = await rollbackPathById(id);
      updateProgress({
        operation: 'deep-check',
        phase: deep ? 'integrity-check' : 'quick-check',
        percent: 30,
        cancellable: false,
        active: true,
      });
      validateBackupFile(path, deep);
      if (deep) deepChecked.add(id);
      const item = (await listValidatedRollbacks()).find((candidate) => candidate.id === id);
      if (!item) {
        throw new BackupServiceError('BACKUP_INVALID', '回滚副本校验失败。');
      }
      updateProgress({
        operation: 'deep-check',
        phase: 'completed',
        percent: 100,
        cancellable: false,
        active: false,
      });
      const { path: _path, ...summary } = item;
      return summary;
    },

    async deleteRollback(id) {
      const path = await rollbackPathById(id);
      validateBackupFile(path);
      await rm(path);
      deepChecked.delete(id);
    },
  };
}
