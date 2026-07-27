// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createPromptsRepository } from '../../src/main/repositories/prompts';
import { DEFAULT_PROMPT_TEMPLATES } from '../../src/shared/defaults';
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

  it('ships the confirmed preparation framework in the new-install default', () => {
    const content = DEFAULT_PROMPT_TEMPLATES.find(
      (template) => template.kind === 'preparation',
    )?.content ?? '';

    expect(content).toContain('Map Competencies');
    expect(content).toMatch(/Top ?5/i);
    expect(content).toContain('STARS');
    expect(content).toContain('Startup');
    expect(content).toContain('Turnaround');
    expect(content).toContain('Realignment');
    expect(content).toContain('Sustaining Success');
    expect(content).toContain('Crisis');
    expect(content).toContain('Dream Candidate Avatar');
    expect(content).toContain('Typical Day');
    expect(content).toContain('Action Guide');
    expect(content).toMatch(/恰好\s*3\s*个/);
    expect(content).toMatch(/中文/);
  });

  it('never overwrites an existing customized preparation prompt', () => {
    database = createTestDatabase();
    const prompts = createPromptsRepository(database);
    const custom = '  我的定制准备框架\n必须保留原样。  ';
    prompts.save('preparation', custom);

    const reopened = createPromptsRepository(database);

    expect(reopened.get('preparation').content).toBe(custom);
  });
});
