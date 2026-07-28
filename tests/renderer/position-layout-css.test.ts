import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('compact position layout CSS', () => {
  it('uses a wrapped horizontal process and a compact desktop sidebar breakpoint', () => {
    const css = readFileSync('src/renderer/styles/app.css', 'utf8');

    expect(css).toMatch(/\.stage-flow\s*\{[^}]*display:\s*flex/s);
    expect(css).toMatch(/\.stage-flow\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*1100px\)/);
  });
});
