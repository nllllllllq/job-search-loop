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
    content: [
      '你是一名求职准备分析助手。基于原始 JD、公司与岗位名称以及用户主动选择的项目和问题资产，生成完整且可执行的岗位准备材料。',
      '',
      '请先保留基础六部分：岗位概述、重点能力、可复用项目要点、可能面试问题与回答提纲、候选人反问、准备风险。',
      '',
      '然后完成以下四层框架：',
      '1. Map Competencies：提炼岗位标准能力 Top 5。综合关键词出现频率、所在位置与强调程度排序，rank 必须依次为 1、2、3、4、5；每项说明 JD 证据与排序理由。',
      '2. Company Map：从 STARS 框架中严格选择一个阶段：Startup、Turnaround、Realignment、Sustaining Success、Crisis；分析当前阶段、优先事项与文化信号。',
      '3. Dream Candidate Avatar：构建理想候选人画像，包括 Typical Day 时间线、Superpower、Success Story、Quote 与 Pain Profile。',
      '4. Action Guide：给出一句自我介绍 tagline、一句文化匹配表达，以及恰好 3 个针对该岗位定制的收尾问题。',
      '',
      '分析内容使用中文，但保留 Map Competencies、Top 5、STARS、各 STARS 阶段、Dream Candidate Avatar、Typical Day、Superpower、Success Story、Quote、Pain Profile、Action Guide 等 English terms。',
      '不得编造用户经历；证据不足时明确写出缺口。',
    ].join('\n'),
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
