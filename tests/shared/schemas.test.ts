import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { PositionInput, ProcessStageInput } from '../../src/shared/domain';
import {
  aiBaseUrlSchema,
  changeProposalInputSchema,
  isoDateSchema,
  positionInputSchema,
  processStageInputSchema,
  projectPayloadSchema,
} from '../../src/shared/schemas';

describe('shared schemas', () => {
  it('keeps position and process-stage output types aligned with domain contracts', () => {
    expectTypeOf<z.output<typeof positionInputSchema>>().toEqualTypeOf<PositionInput>();
    expectTypeOf<z.output<typeof processStageInputSchema>>().toEqualTypeOf<ProcessStageInput>();
  });

  it('accepts calendar-valid ISO dates only', () => {
    expect(isoDateSchema.safeParse('2028-02-29').success).toBe(true);
    expect(isoDateSchema.safeParse('2026-99-99').success).toBe(false);
    expect(isoDateSchema.safeParse('2026-02-30').success).toBe(false);
  });

  it('trims position labels but preserves meaningful raw JD whitespace', () => {
    const parsed = positionInputSchema.parse({
      company: ' 远山科技 ',
      title: ' 产品经理 ',
      interest: 5,
      rawJd: '  第一行\n第二行  ',
    });

    expect(parsed).toEqual({
      company: '远山科技',
      title: '产品经理',
      interest: 5,
      rawJd: '  第一行\n第二行  ',
    });
    expect(positionInputSchema.safeParse({
      company: '远山科技',
      title: '产品经理',
      interest: 5,
      rawJd: ' \n\t ',
    }).success).toBe(false);
  });

  it('requires target IDs for update and merge proposals only', () => {
    const targetId = '7c82c1d8-9f2c-4d69-891c-ea3fcb873210';
    const base = {
      targetType: 'project' as const,
      payload: { name: '用户研究项目' },
      rationale: '来自面试复盘',
      positionId: null,
      interviewId: null,
    };

    expect(changeProposalInputSchema.safeParse({ ...base, operation: 'create', targetId: null }).success).toBe(true);
    expect(changeProposalInputSchema.safeParse({ ...base, operation: 'create', targetId }).success).toBe(false);
    expect(changeProposalInputSchema.safeParse({ ...base, operation: 'update', targetId }).success).toBe(true);
    expect(changeProposalInputSchema.safeParse({ ...base, operation: 'update', targetId: null }).success).toBe(false);
    expect(changeProposalInputSchema.safeParse({ ...base, operation: 'merge', targetId }).success).toBe(true);
    expect(changeProposalInputSchema.safeParse({ ...base, operation: 'merge', targetId: null }).success).toBe(false);
  });

  it('reads legacy combined project results without discarding their exact text', () => {
    expect(projectPayloadSchema.parse({
      name: '旧项目',
      background: '旧背景',
      outcomesAndEvidence: '原样保留的结果与证据',
      storytelling_versions: '旧版附加叙事',
    })).toMatchObject({
      name: '旧项目',
      background: '旧背景',
      outcome: '原样保留的结果与证据',
      evidence: '',
      storytellingVersions: '旧版附加叙事',
    });
  });

  it('allows HTTPS providers and exact loopback HTTP endpoints only', () => {
    expect(aiBaseUrlSchema.parse('https://API.EXAMPLE.com:443/v1/')).toBe(
      'https://api.example.com/v1',
    );
    expect(aiBaseUrlSchema.parse('http://localhost:11434/')).toBe(
      'http://localhost:11434',
    );
    expect(aiBaseUrlSchema.parse('http://127.0.0.1:8000/v1/')).toBe(
      'http://127.0.0.1:8000/v1',
    );
    expect(aiBaseUrlSchema.parse('http://[::1]:11434/v1/')).toBe(
      'http://[::1]:11434/v1',
    );
  });

  it.each([
    'http://provider.example.com/v1',
    'http://192.168.1.20:8000/v1',
    'http://0.0.0.0:11434/v1',
    'http://localhost.example.com/v1',
    'http://127.0.0.2/v1',
    'http://127.1/v1',
    'http://2130706433/v1',
    'http://0x7f000001/v1',
    'http://[::]:11434/v1',
    'http://[0:0:0:0:0:0:0:1]:11434/v1',
    'https://user:pass@provider.example.com/v1',
    'https://@provider.example.com/v1',
    'https:/@provider.example.com/v1',
    'https:@provider.example.com/v1',
    'https:\\@provider.example.com/v1',
    'https:////@provider.example.com/v1',
    'https://\t/@provider.example.com/v1',
    'https://\n/@provider.example.com/v1',
    'https://\r/@provider.example.com/v1',
    'https://provider.example.com/v1?token=secret',
    'https://provider.example.com/v1?',
    'https://provider.example.com/v1#fragment',
    'https://provider.example.com/v1#',
  ])('rejects unsafe AI base URL %s', (baseUrl) => {
    expect(aiBaseUrlSchema.safeParse(baseUrl).success).toBe(false);
  });
});
