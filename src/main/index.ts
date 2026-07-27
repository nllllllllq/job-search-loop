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
  type LiveDatabaseController,
} from './services/backup';

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
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

  if (app.isPackaged) {
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

app.whenReady().then(() => {
  databasePath = join(app.getPath('userData'), 'job-search-loop.sqlite');
  database = openDatabase(databasePath);
  databaseClosed = false;
  const repositories = createRepositoryBundle(database);
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
