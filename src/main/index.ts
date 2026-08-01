import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
} from 'electron';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './database';
import { createRepositoryBundle, registerIpcHandlers } from './ipc/register';
import { createAiSettingsStore, AiServiceError } from './services/ai-settings';
import { createAiClient } from './services/ai-client';
import {
  createBackupService,
  readRestoreMarker,
  recoverInterruptedRestore,
  type LiveDatabaseController,
} from './services/backup';

const isE2e = process.env.JOB_SEARCH_LOOP_E2E === '1';
const e2eUserDataPath = process.env.JOB_SEARCH_LOOP_USER_DATA;
if (isE2e && e2eUserDataPath) {
  // Electron requires userData to be redirected before the ready event. This
  // branch is only enabled by the test harness; production keeps the standard
  // OS-managed application data directory.
  app.setPath('userData', e2eUserDataPath);
}

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#f7f4ed',
    title: '求职闭环',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  if (app.isPackaged || isE2e) {
    void mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
  } else {
    void mainWindow.loadURL('http://localhost:5173');
  }

  return mainWindow;
}

let database: DatabaseSync | null = null;
let databaseClosed = false;
let databaseRestarting = false;
let databasePath = '';

function closeDatabaseOnce(): void {
  if (database === null || databaseClosed) return;
  databaseClosed = true;
  database.close();
  database = null;
}

app.whenReady().then(async () => {
  databasePath = join(app.getPath('userData'), 'job-search-loop.sqlite');
  try {
    const interrupted = await readRestoreMarker(databasePath);
    if (interrupted !== null) {
      const result = await dialog.showMessageBox({
        type: 'warning',
        title: '发现未完成的数据恢复',
        message: '上次恢复在替换数据库时中断。',
        detail: '你可以继续安装已校验的备份、恢复到操作前副本，或保留现场后退出应用。',
        buttons: ['继续恢复', '使用回滚副本', '保留现场并退出'],
        defaultId: 1,
        cancelId: 2,
        noLink: true,
      });
      const choice = result.response === 0
        ? 'continue'
        : result.response === 1
          ? 'rollback'
          : 'preserve';
      await recoverInterruptedRestore(databasePath, choice);
      if (choice === 'preserve') {
        app.exit(0);
        return;
      }
    }
  } catch {
    dialog.showErrorBox(
      '数据恢复无法继续',
      '恢复现场未被修改。请保留应用数据目录并重新启动后选择回滚副本。',
    );
    app.exit(1);
    return;
  }
  database = openDatabase(databasePath);
  databaseClosed = false;
  const repositories = createRepositoryBundle(database);
  repositories.aiTasks.interruptRunningOnStartup();
  const databaseController: LiveDatabaseController = {
    path: databasePath,
    current() {
      if (database === null || databaseClosed) {
        throw new Error('Database is not available');
      }
      return database;
    },
    close() {
      closeDatabaseOnce();
    },
    reopen() {
      database = openDatabase(databasePath);
      databaseClosed = false;
      return database;
    },
  };
  const backup = createBackupService({ controller: databaseController });
  const settings = createAiSettingsStore({
    settingsPath: join(app.getPath('userData'), 'ai-settings.json'),
    encrypt(value) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new AiServiceError(
          'AI_SETTINGS_UNAVAILABLE',
          '本机安全存储暂时不可用。',
        );
      }
      return safeStorage.encryptString(value);
    },
    decrypt(value) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new AiServiceError(
          'AI_SETTINGS_UNAVAILABLE',
          '本机安全存储暂时不可用。',
        );
      }
      return safeStorage.decryptString(value);
    },
  });
  const aiClient = createAiClient({
    fetch: globalThis.fetch,
    getSettings: () => settings.getPrivate(),
  });
  registerIpcHandlers(
    ipcMain,
    repositories,
    {
      settings,
      client: aiClient,
    },
    {
      isBlocked: () => databaseRestarting,
      system: {
        backup,
        dialogs: {
          async chooseExportPath() {
            const result = await dialog.showSaveDialog({
              title: '导出本地备份',
              defaultPath: `求职闭环备份-${new Date().toISOString().slice(0, 10)}.jobloop`,
              filters: [{ name: '求职闭环备份', extensions: ['jobloop'] }],
              properties: ['createDirectory', 'showOverwriteConfirmation'],
            });
            if (result.canceled || !result.filePath) return null;
            return result.filePath.endsWith('.jobloop')
              ? result.filePath
              : `${result.filePath}.jobloop`;
          },
          async chooseRestorePath() {
            const result = await dialog.showOpenDialog({
              title: '选择本地备份',
              filters: [{ name: '求职闭环备份', extensions: ['jobloop'] }],
              properties: ['openFile'],
            });
            return result.canceled ? null : (result.filePaths[0] ?? null);
          },
        },
        onRestoreCompleted() {
          databaseRestarting = true;
          setTimeout(() => {
            app.relaunch();
            app.exit(0);
          }, 900);
        },
      },
    },
  );
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', closeDatabaseOnce);
app.on('will-quit', closeDatabaseOnce);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
