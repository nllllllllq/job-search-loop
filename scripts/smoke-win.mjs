import { _electron as electron } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const executablePath = resolve('release', 'win-unpacked', '求职闭环.exe');
if (!existsSync(executablePath)) {
  throw new Error(`未找到 Windows unpacked 应用：${executablePath}`);
}

const userData = await mkdtemp(join(tmpdir(), 'job-search-loop-smoke-'));
let app;

try {
  app = await electron.launch({
    executablePath,
    // Required by the isolated Codex Windows runner. The packaged app itself
    // does not add this flag for normal user launches.
    args: ['--disable-gpu', '--no-sandbox'],
    env: {
      ...process.env,
      JOB_SEARCH_LOOP_E2E: '1',
      JOB_SEARCH_LOOP_USER_DATA: userData,
    },
  });
  const page = await app.firstWindow();
  await page.getByRole('link', { name: '岗位' }).waitFor({ state: 'visible' });
  const devToolsOpened = await app.evaluate(({ BrowserWindow }) => (
    BrowserWindow.getAllWindows().some(
      (window) => window.webContents.isDevToolsOpened(),
    )
  ));
  if (devToolsOpened) {
    throw new Error('生产应用启动时不应自动打开 DevTools');
  }

  const databasePath = join(userData, 'job-search-loop.sqlite');
  const deadline = Date.now() + 10_000;
  while (!existsSync(databasePath) && Date.now() < deadline) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (!existsSync(databasePath)) {
    throw new Error(`应用启动后未创建数据库：${databasePath}`);
  }
  console.log(`Windows unpacked smoke passed: ${executablePath}`);
} finally {
  if (app) await app.close().catch(() => undefined);
  await rm(userData, { recursive: true, force: true });
}
