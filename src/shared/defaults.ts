import type { CanonicalStage, PromptKind } from './domain';

export interface DefaultProcessStage {
  name: string;
  canonicalStage: CanonicalStage;
  orderIndex: number;
}

export const DEFAULT_PROCESS_STAGES: readonly DefaultProcessStage[] = [
  { name: '感兴趣', canonicalStage: 'interested', orderIndex: 0 },
  { name: '已投递', canonicalStage: 'applied', orderIndex: 1 },
  { name: '笔试', canonicalStage: 'assessment', orderIndex: 2 },
  { name: '面试', canonicalStage: 'interview', orderIndex: 3 },
  { name: 'Offer', canonicalStage: 'offer', orderIndex: 4 },
];

export interface DefaultPromptTemplate {
  id: string;
  kind: PromptKind;
  name: string;
  content: string;
}

export const DEFAULT_PROMPT_TEMPLATES: readonly DefaultPromptTemplate[] = [
  {
    id: '0a8d1dfc-9a87-4d57-9e3c-451c20a6a901',
    kind: 'preparation',
    name: '岗位准备',
    content: '基于原始 JD 和已选择资产，输出岗位概述、重点能力、可复用项目要点、可能面试问题与回答提纲、候选人反问以及准备风险。',
  },
  {
    id: '1b4a8791-78e5-42f2-8da4-a322bb32f9e2',
    kind: 'interview-review',
    name: '面试复盘',
    content: '总结本次面试记录，识别优势与缺口，并提出需要用户审核的项目、问题、能力或心得变更建议。',
  },
  {
    id: '2c4e2b10-52aa-4a0a-b5a3-3e3b9c5e7f03',
    kind: 'capability-analysis',
    name: '共性能力分析',
    content: '分析所选原始 JD 中反复出现的能力，输出能力名称、出现频率、已有证据与待补足的能力缺口。',
  },
];
