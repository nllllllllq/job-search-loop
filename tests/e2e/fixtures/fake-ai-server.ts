import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedAiRequest {
  body: string;
  headers: IncomingMessage['headers'];
  method: string | undefined;
  path: string | undefined;
}

export interface FakeAiServer {
  baseUrl: string;
  requests: RecordedAiRequest[];
  close(): Promise<void>;
}

const REUSABLE_QUESTION = '如何设计用户研究？';

export const preparationOutput = {
  companyAndProductResearch: {
    businessAndUsers: '面向企业用户提供 AI 产品。',
    coreProducts: ['企业智能助手'],
    businessModel: '企业订阅，具体定价待核实。',
    recentDirection: '正在加强智能体能力，细节待核实。',
    roleProductHypothesis: '岗位可能负责企业智能助手，需面试核实。',
    verificationNotes: ['核实具体产品线'],
  },
  competencyMap: [
    { rank: 1, name: 'Problem Solving', jdEvidence: 'JD 强调解决用户痛点。', roleUsage: '识别产品问题。', proofSuggestion: '准备用户研究证据。' },
    { rank: 2, name: 'Communication', jdEvidence: 'JD 强调跨团队协作。', roleUsage: '推动团队对齐。', proofSuggestion: '准备协作案例。' },
    { rank: 3, name: 'Strategic Thinking', jdEvidence: 'JD 要求产品规划。', roleUsage: '规划产品方向。', proofSuggestion: '准备规划依据。' },
    { rank: 4, name: 'Leadership', jdEvidence: 'JD 要求推动项目落地。', roleUsage: '推动关键决策。', proofSuggestion: '准备推动案例。' },
    { rank: 5, name: 'Execution', jdEvidence: 'JD 强调结果与迭代。', roleUsage: '完成验证迭代。', proofSuggestion: '准备结果证据。' },
  ],
  companyMap: {
    stage: 'Realignment',
    summary: '公司正在重新校准产品与用户需求。',
    priorities: ['验证核心用户需求', '建立产品优先级'],
    culture: ['重视证据', '跨团队协作'],
  },
  dreamCandidateAvatar: {
    typicalDay: [
      {
        time: '09:30',
        activity: '复盘用户反馈',
        purpose: '识别最值得解决的问题',
      },
      {
        time: '14:00',
        activity: '推动方案评审',
        purpose: '让团队围绕证据达成共识',
      },
    ],
    superpower: '把模糊的用户抱怨变成团队可以行动的产品问题。',
    successStory: '通过访谈和数据验证关键痛点，推动团队调整优先级并完成迭代。',
    quote: '先理解真实问题，再设计解决方案。',
    painProfile: '岗位存在是因为用户信号分散；候选人用研究与协作把信号转成决策。',
  },
  actionGuide: {
    selfIntroTagline: '我擅长把用户洞察转化为可落地的产品决策。',
    cultureFitPhrase: '我习惯用证据对齐团队，并快速验证关键假设。',
    questions: [
      '当前岗位最优先解决的用户问题是什么？',
      '团队如何衡量用户研究对产品决策的影响？',
      '前三个月最重要的成功标准是什么？',
    ],
    verificationChecklist: ['核实岗位负责产品'],
  },
};

const interviewReviewOutput = {
  summary: '候选人能够说明用户研究方法，但需要补充业务影响证据。',
  strengths: ['研究步骤清晰', '能够解释关键取舍'],
  gaps: ['缺少量化业务结果'],
  proposals: [
    {
      targetType: 'question',
      targetId: null,
      operation: 'create',
      rationale: '沉淀本次出现的高价值面试问题。',
      payload: {
        type: 'interviewer',
        text: REUSABLE_QUESTION,
        answerDraft: '从研究目标、样本选择、方法、洞察和决策影响五部分回答。',
        projectIds: [],
        capabilityIds: [],
        occurrenceCount: 1,
        status: 'active',
      },
    },
  ],
};

function sendJson(res: ServerResponse, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function startFakeAiServer(): Promise<FakeAiServer> {
  const requests: RecordedAiRequest[] = [];
  const server = createServer((req, res) => {
    void readBody(req).then((body) => {
      requests.push({
        body,
        headers: req.headers,
        method: req.method,
        path: req.url,
      });

      const output = body.includes('<review_data_json>')
        ? interviewReviewOutput
        : body.includes('仅返回 JSON')
          ? { ok: true }
          : preparationOutput;
      if (req.url === '/v1/responses') {
        sendJson(res, {
          output_text: `\`\`\`json\n${JSON.stringify(output)}\n\`\`\``,
        });
      } else {
        sendJson(res, {
          choices: [{
            message: {
              content: JSON.stringify(output),
            },
          }],
        });
      }
    }).catch(() => {
      res.writeHead(500);
      res.end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }),
  };
}

export { REUSABLE_QUESTION };
