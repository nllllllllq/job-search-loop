import { describe, expect, it } from 'vitest';
import {
  preparationHistoricalOutputSchema,
  preparationOutputSchema,
} from '../../src/shared/schemas';

const completeOutput = {
  roleSummary: '负责 AI 产品从洞察到交付。',
  capabilityFocus: [{ name: '用户研究', reason: 'JD 在职责首段重复强调。' }],
  projectTalkingPoints: [],
  likelyQuestions: [],
  candidateQuestions: [],
  riskNotes: [],
  competencyMap: [
    { rank: 1, name: '用户洞察', evidence: '职责首段与要求段均出现。' },
    { rank: 2, name: '产品规划', evidence: '核心职责明确强调。' },
    { rank: 3, name: 'AI 理解', evidence: '岗位标题与技能要求均强调。' },
    { rank: 4, name: '数据分析', evidence: '结果衡量要求中出现。' },
    { rank: 5, name: '跨团队协作', evidence: '协作要求中出现。' },
  ],
  companyMap: {
    stage: 'Realignment',
    summary: '公司正重新校准 AI 产品方向。',
    priorities: ['验证高价值场景'],
    culture: ['快速实验'],
  },
  dreamCandidateAvatar: {
    typicalDay: [
      { time: '09:00', activity: '分析用户反馈', purpose: '识别高风险假设' },
      { time: '14:00', activity: '推动跨团队评审', purpose: '形成可执行决策' },
    ],
    superpower: '把模糊需求转成可验证实验。',
    successStory: '在资源有限时推动关键指标改善。',
    quote: '先验证最昂贵的假设。',
    painProfile: '缺乏完整从零到一案例会削弱可信度。',
  },
  actionGuide: {
    selfIntroTagline: '我擅长把复杂 AI 场景变成可验证的产品决策。',
    cultureFitPhrase: '用小步实验建立跨团队共识。',
    questions: [
      '当前团队最希望这个岗位解决什么问题？',
      '公司如何衡量 AI 产品的真实价值？',
      '这个岗位前三个月最关键的里程碑是什么？',
    ],
  },
} as const;

const connectedOutput = {
  companyAndProductResearch: {
    businessAndUsers: '面向企业用户提供 AI 产品。',
    coreProducts: ['企业智能助手'],
    businessModel: '企业订阅，具体定价待核实。',
    recentDirection: '正在加强智能体能力，细节待核实。',
    roleProductHypothesis: '岗位可能负责企业智能助手，需面试核实。',
    verificationNotes: ['核实具体产品线和核心指标'],
  },
  competencyMap: [1, 2, 3, 4, 5].map((rank) => ({
    rank: rank as 1 | 2 | 3 | 4 | 5,
    name: `能力${rank}`,
    jdEvidence: 'JD 明确强调。',
    roleUsage: '用于岗位日常工作。',
    proofSuggestion: '准备可核验的相关案例。',
  })),
  companyMap: completeOutput.companyMap,
  dreamCandidateAvatar: completeOutput.dreamCandidateAvatar,
  actionGuide: {
    ...completeOutput.actionGuide,
    verificationChecklist: ['核实岗位负责产品'],
  },
} as const;

describe('preparation output schemas', () => {
  it('requires the complete framework with ordered Top 5 competencies and exactly 3 questions', () => {
    expect(preparationOutputSchema.safeParse(connectedOutput).success).toBe(true);

    expect(preparationOutputSchema.safeParse({
      ...connectedOutput,
      competencyMap: connectedOutput.competencyMap.slice(0, 4),
    }).success).toBe(false);
    expect(preparationOutputSchema.safeParse({
      ...connectedOutput,
      competencyMap: connectedOutput.competencyMap.map((item, index) => ({
        ...item,
        rank: index === 4 ? 4 : item.rank,
      })),
    }).success).toBe(false);
    expect(preparationOutputSchema.safeParse({
      ...connectedOutput,
      companyMap: { ...connectedOutput.companyMap, stage: 'Growth' },
    }).success).toBe(false);
    expect(preparationOutputSchema.safeParse({
      ...connectedOutput,
      actionGuide: {
        ...connectedOutput.actionGuide,
        questions: connectedOutput.actionGuide.questions.slice(0, 2),
      },
    }).success).toBe(false);
  });

  it('keeps the old six-field output readable as a legacy snapshot', () => {
    const {
      competencyMap: _competencyMap,
      companyMap: _companyMap,
      dreamCandidateAvatar: _dreamCandidateAvatar,
      actionGuide: _actionGuide,
      ...legacyOutput
    } = completeOutput;

    expect(preparationOutputSchema.safeParse(legacyOutput).success).toBe(false);
    expect(preparationHistoricalOutputSchema.safeParse(legacyOutput).success).toBe(true);
    expect(preparationHistoricalOutputSchema.safeParse(completeOutput).success).toBe(true);
    expect(preparationHistoricalOutputSchema.safeParse(connectedOutput).success).toBe(true);
  });
});
