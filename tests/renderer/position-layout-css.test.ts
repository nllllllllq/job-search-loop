import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('compact position layout CSS', () => {
  it('uses a wrapped horizontal process and a compact desktop sidebar breakpoint', () => {
    const css = readFileSync('src/renderer/styles/app.css', 'utf8');

    expect(css).toMatch(/\.stage-timeline\s*\{[^}]*display:\s*grid/s);
    expect(css).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(/);
    expect(css).toMatch(/@media\s*\(max-width:\s*1100px\)/);
  });
});
