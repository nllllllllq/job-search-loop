import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production renderer build', () => {
  it('uses relative asset URLs when loaded from Electron file URLs', async () => {
    const builtHtml = await readFile(resolve(process.cwd(), 'dist/index.html'), 'utf8');

    expect(builtHtml).toMatch(/(?:src|href)="\.\/assets\//);
    expect(builtHtml).not.toMatch(/(?:src|href)="\/assets\//);
  });
});
