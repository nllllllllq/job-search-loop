import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production renderer build', () => {
  it('uses relative asset URLs when loaded from Electron file URLs', async () => {
    const builtHtml = await readFile(resolve(process.cwd(), 'dist/index.html'), 'utf8');

    expect(builtHtml).toMatch(/(?:src|href)="\.\/assets\//);
    expect(builtHtml).not.toMatch(/(?:src|href)="\/assets\//);
  });

  it('bundles preload dependencies for Electron sandbox execution', async () => {
    const builtPreload = await readFile(
      resolve(process.cwd(), 'dist-electron/preload/index.js'),
      'utf8',
    );

    expect(builtPreload).toContain('require("electron")');
    expect(builtPreload).not.toMatch(/require\(["']\.\.\/shared\//);
    expect(builtPreload).not.toMatch(/require\(["']zod/);
  });
});
