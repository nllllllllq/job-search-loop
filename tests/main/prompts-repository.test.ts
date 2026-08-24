// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createPromptsRepository } from '../../src/main/repositories/prompts';
import {
  DEFAULT_PROMPT_TEMPLATES,
  LEGACY_PROJECT_IMPORT_PROMPT,
  PREVIOUS_PROJECT_IMPORT_PROMPT,
} from '../../src/shared/defaults';
import { createTestDatabase } from '../helpers/database';

let database: DatabaseSync | null = null;

afterEach(() => {
  database?.close();
  database = null;
});

describe('prompt templates repository', () => {
  it('initializes the five required templates with unique kinds', () => {
    database = createTestDatabase();
    const prompts = createPromptsRepository(database);

    expect(prompts.list().map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: 'capability-analysis', name: '共性能力分析' },
      { kind: 'interview-review', name: '面试复盘' },
      { kind: 'position-image', name: '岗位截图识别' },
      { kind: 'preparation', name: '岗位准备' },
      { kind: 'project-import', name: '项目文件导入' },
    ]);
    expect(new Set(prompts.list().map((prompt) => prompt.kind)).size).toBe(5);
  });

  it('allows the project import prompt to be read and edited', () => {
    database = createTestDatabase();
    const prompts = createPromptsRepository(database);

    expect(prompts.get('project-import').content).toContain('项目');
    expect(prompts.save('project-import', '只按原文识别项目。').content)
      .toBe('只按原文识别项目。');
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
    expect(content).toMatch(/任务时间线/);
    expect(content).toMatch(/Superpower.*简单语言.*JD.*最大痛点/s);
    expect(content).toMatch(/Success Story.*使用.*Superpower.*成功故事/s);
    expect(content).toMatch(/Quote.*信念体系/s);
    expect(content).toMatch(/Pain Profile.*岗位为何存在.*如何解决/s);
    expect(content).toContain('Action Guide');
    expect(content).toMatch(/恰好\s*3\s*个/);
    expect(content).toMatch(/中文/);
  });

  it('ships an exact project-import JSON contract', () => {
    const content = DEFAULT_PROMPT_TEMPLATES.find(
      (template) => template.kind === 'project-import',
    )?.content ?? '';

    expect(content).toContain('classification');
    expect(content).toContain('valid-project');
    expect(content).toContain('no-valid-project');
    expect(content).toContain('projects');
    expect(content).toContain('startLine');
    expect(content).toContain('provenance');
    expect(content).toContain('ai-rewrite');
    expect(content).toContain('ai-suggestion');
    expect(content).toContain('evidence');
    expect(content).toContain('unusedContent');
    expect(content).toContain('explanation');
  });

  it('upgrades only the shipped legacy project-import prompt', () => {
    database = createTestDatabase();
    const legacy = [
      '你是项目档案整理助手。请只依据用户提供的文档原文识别项目边界，并提取可核验的项目字段。',
      '不得编造文档中没有出现的经历、数据或职责；无法可靠分类的内容放入 unclassifiedNotes。',
      'startLine 必须指向每个项目在带行号原文中的起始行。',
    ].join('\n');
    database.prepare(
      "UPDATE prompt_templates SET content = ? WHERE kind = 'project-import'",
    ).run(legacy);

    const upgraded = createPromptsRepository(database);

    expect(upgraded.get('project-import').content).not.toBe(legacy);
    expect(upgraded.get('project-import').content).toContain('classification');

    upgraded.save('project-import', '用户自定义项目导入规则');
    const reopened = createPromptsRepository(database);
    expect(reopened.get('project-import').content).toBe('用户自定义项目导入规则');
  });

  it('upgrades the immediately previous shipped project-import prompt too', () => {
    database = createTestDatabase();
    database.prepare(
      "UPDATE prompt_templates SET content = ? WHERE kind = 'project-import'",
    ).run(PREVIOUS_PROJECT_IMPORT_PROMPT);

    const upgraded = createPromptsRepository(database);

    expect(upgraded.get('project-import').content).toBe(
      DEFAULT_PROMPT_TEMPLATES.find((template) => template.kind === 'project-import')?.content,
    );
    expect(upgraded.get('project-import').content).not.toBe(LEGACY_PROJECT_IMPORT_PROMPT);
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
