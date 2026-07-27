import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './database';
import { registerIpcHandlers } from './ipc/register';

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

function closeDatabaseOnce(): void {
  if (database === null || databaseClosed) return;
  databaseClosed = true;
  database.close();
  database = null;
}

app.whenReady().then(() => {
  database = openDatabase(join(app.getPath('userData'), 'job-search-loop.sqlite'));
  registerIpcHandlers(ipcMain, database);
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
