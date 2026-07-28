import { randomUUID } from 'node:crypto';
import {
  copyFile,
  rename,
  rm,
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

const REQUIRED_TABLES_V5 = [
  ...REQUIRED_TABLES_V1_TO_V4,
  'capability_analysis_runs',
].sort();

function requiredTablesForVersion(version: number): readonly string[] {
  return version >= 5 ? REQUIRED_TABLES_V5 : REQUIRED_TABLES_V1_TO_V4;
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

export interface BackupService {
  exportTo(destinationPath: string): Promise<void>;
  restoreFrom(sourcePath: string): Promise<RestoreResult>;
}

interface BackupServiceDependencies {
  controller: LiveDatabaseController;
  backup?: typeof sqliteBackup;
  now?: () => Date;
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

export function validateBackupFile(path: string): void {
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

    const integrity = scalarText(database.prepare('PRAGMA quick_check').get());
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

function siblingTemporaryPath(targetPath: string, label: string): string {
  return join(
    dirname(targetPath),
    `.${basename(targetPath)}.${label}-${randomUUID()}.tmp`,
  );
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

export function createBackupService(
  dependencies: BackupServiceDependencies,
): BackupService {
  const {
    controller,
    backup = sqliteBackup,
    now = () => new Date(),
  } = dependencies;

  return {
    async exportTo(destinationPath) {
      const destination = resolve(destinationPath);
      if (destination === resolve(controller.path)) {
        throw new BackupServiceError(
          'BACKUP_FAILED',
          '备份文件不能覆盖当前使用中的数据库。',
        );
      }
      const temporaryPath = siblingTemporaryPath(destination, 'export');
      try {
        await backup(controller.current(), temporaryPath);
        validateBackupFile(temporaryPath);
        await replaceFileAtomically(temporaryPath, destination);
      } catch (error) {
        if (error instanceof BackupServiceError) throw error;
        throw new BackupServiceError(
          'BACKUP_FAILED',
          '导出备份失败，当前业务数据没有被修改。',
          { cause: error },
        );
      } finally {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
      }
    },

    async restoreFrom(sourcePath) {
      const livePath = resolve(controller.path);
      const source = resolve(sourcePath);
      if (source === livePath) {
        throw new BackupServiceError(
          'BACKUP_INVALID',
          '不能从当前使用中的数据库执行恢复。',
        );
      }

      const stagedPath = siblingTemporaryPath(livePath, 'restore');
      const rollbackPath = rollbackName(livePath, now());
      let liveClosed = false;
      let replacementStarted = false;
      try {
        validateBackupFile(source);
        await copyFile(source, stagedPath);
        validateBackupFile(stagedPath);

        await backup(controller.current(), rollbackPath);
        validateBackupFile(rollbackPath);

        controller.close();
        liveClosed = true;
        await rm(`${livePath}-wal`, { force: true });
        await rm(`${livePath}-shm`, { force: true });
        replacementStarted = true;
        await replaceFileAtomically(stagedPath, livePath);
        controller.reopen();
        liveClosed = false;
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
          const recoveryPath = siblingTemporaryPath(livePath, 'rollback');
          try {
            await copyFile(rollbackPath, recoveryPath);
            await replaceFileAtomically(recoveryPath, livePath);
            controller.reopen();
            liveClosed = false;
          } catch (rollbackError) {
            await rm(recoveryPath, { force: true }).catch(() => undefined);
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

        if (error instanceof BackupServiceError) throw error;
        throw new BackupServiceError(
          'BACKUP_FAILED',
          '恢复失败，已保留恢复前的数据。',
          { cause: error },
        );
      } finally {
        await rm(stagedPath, { force: true }).catch(() => undefined);
      }
    },
  };
}
