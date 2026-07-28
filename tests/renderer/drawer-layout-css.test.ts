// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('dashboard drawer viewport layout', () => {
  it('pins the layer to the viewport while keeping the drawer body scrollable', () => {
    const css = readFileSync(
      new URL('../../src/renderer/styles/app.css', import.meta.url),
      'utf8',
    );

    expect(css).toMatch(/\.dashboard-drawer-layer\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
    expect(css).toMatch(
      /\.dashboard-drawer\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s,
    );
    expect(css).toMatch(
      /\.dashboard-drawer__body\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s,
    );
  });
});
