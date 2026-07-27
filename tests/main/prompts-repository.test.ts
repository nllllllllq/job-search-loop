// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createPromptsRepository } from '../../src/main/repositories/prompts';
import { createTestDatabase } from '../helpers/database';

let database: DatabaseSync | null = null;

afterEach(() => {
  database?.close();
  database = null;
});

describe('prompt templates repository', () => {
  it('initializes exactly the three required templates with unique kinds', () => {
    database = createTestDatabase();
    const prompts = createPromptsRepository(database);

    expect(prompts.list().map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: 'capability-analysis', name: '共性能力分析' },
      { kind: 'interview-review', name: '面试复盘' },
      { kind: 'preparation', name: '岗位准备' },
    ]);
    expect(new Set(prompts.list().map((prompt) => prompt.kind)).size).toBe(3);
  });

  it('saves the exact prompt content without trimming meaningful whitespace', () => {
    database = createTestDatabase();
    const prompts = createPromptsRepository(database);
    const exact = '  第一行\n\n第二行  ';

    expect(prompts.save('preparation', exact).content).toBe(exact);
    expect(prompts.get('preparation').content).toBe(exact);
  });

  it('rejects blank content without changing the existing template', () => {
    database = createTestDatabase();
    const prompts = createPromptsRepository(database);
    const before = prompts.get('interview-review');

    expect(() => prompts.save('interview-review', ' \n\t ')).toThrow();
    expect(prompts.get('interview-review').content).toBe(before.content);
  });
});
