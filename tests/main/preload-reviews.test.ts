// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interview, InterviewReviewPreview } from '../../src/shared/domain';
import { CHANNELS, type JobSearchApi } from '../../src/shared/ipc';
import { registerReviewHandlers } from '../../src/main/ipc/reviews';

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: electronMocks.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: electronMocks.invoke,
  },
}));

await import('../../src/preload/index');

const interviewId = '11111111-1111-4111-8111-111111111111';
const positionId = '22222222-2222-4222-8222-222222222222';
const token = '33333333-3333-4333-8333-333333333333';

function exposedApi(): JobSearchApi {
  const call = electronMocks.exposeInMainWorld.mock.calls[0];
  if (!call || call[0] !== 'jobSearch') throw new Error('Preload API was not exposed');
  return call[1] as JobSearchApi;
}

describe('review IPC and preload contract', () => {
  beforeEach(() => {
    electronMocks.invoke.mockReset();
  });

  it('rejects invalid review IDs before IPC and malformed responses after IPC', async () => {
    await expect(exposedApi().reviews.review.preview({
      interviewId: 'not-a-uuid',
      selectedAssets: {
        projectIds: [],
        questionIds: [],
        capabilityIds: [],
        insightIds: [],
      },
    })).rejects.toBeDefined();
    await expect(exposedApi().reviews.review.confirm('not-a-uuid')).rejects.toBeDefined();
    expect(electronMocks.invoke).not.toHaveBeenCalled();

    electronMocks.invoke.mockResolvedValueOnce({ prompt: 'renderer controlled' });
    await expect(exposedApi().reviews.review.preview({
      interviewId,
      selectedAssets: {
        projectIds: [],
        questionIds: [],
        capabilityIds: [],
        insightIds: [],
      },
    })).rejects.toBeDefined();
    electronMocks.invoke.mockResolvedValueOnce({ interview: {}, proposals: [] });
    await expect(exposedApi().reviews.review.confirm(token)).rejects.toBeDefined();
  });

  it('passes only parsed selected asset ids and exposes narrow preview cancellation', async () => {
    const input = {
      interviewId,
      selectedAssets: {
        projectIds: ['44444444-4444-4444-8444-444444444444'],
        questionIds: [],
        capabilityIds: [],
        insightIds: [],
      },
    };
    electronMocks.invoke.mockResolvedValueOnce(undefined);

    await exposedApi().reviews.review.cancelPreview(token);
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      CHANNELS.reviews.review.cancelPreview,
      token,
    );

    electronMocks.invoke.mockResolvedValueOnce({ malformed: true });
    await expect(exposedApi().reviews.review.preview(input)).rejects.toBeDefined();
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      CHANNELS.reviews.review.preview,
      input,
    );
  });

  it('preserves AI_INPUT_UNSUPPORTED errors from IPC for the renderer', async () => {
    electronMocks.invoke.mockRejectedValueOnce(new Error(
      'Error invoking remote method: JOB_SEARCH_ERROR:' + JSON.stringify({
        code: 'AI_INPUT_UNSUPPORTED',
        message: 'The configured AI model does not support this input type.',
      }),
    ));

    await expect(exposedApi().ai.settings.get()).rejects.toMatchObject({
      code: 'AI_INPUT_UNSUPPORTED',
      message: 'The configured AI model does not support this input type.',
    });
  });

  it('keeps direct acceptance distinct from edited acceptance at the bridge', async () => {
    const accepted = {
      id: token,
      targetType: 'insight',
      targetId: interviewId,
      operation: 'create',
      payload: {
        title: '复盘',
        content: '先说结论。',
        positionId: null,
        projectId: null,
        questionId: null,
        capabilityId: null,
      },
      rationale: '沉淀心得',
      positionId: null,
      interviewId: null,
      analysisRunId: null,
      status: 'accepted',
      acceptedPayload: {
        title: '复盘',
        content: '先说结论。',
        positionId: null,
        projectId: null,
        questionId: null,
        capabilityId: null,
      },
      createdAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-27T00:00:00.000Z',
      resolvedAt: '2026-07-27T00:00:00.000Z',
    } as const;
    electronMocks.invoke.mockResolvedValue(accepted);

    await exposedApi().reviews.proposals.accept(token);
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      CHANNELS.reviews.proposals.accept,
      { id: token },
    );
    await exposedApi().reviews.proposals.accept(token, accepted.payload);
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      CHANNELS.reviews.proposals.accept,
      { id: token, editedPayload: accepted.payload },
    );
  });

  it('does not let renderer payloads bypass the main review service', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const interviews = {
      create: vi.fn(),
      update: vi.fn(),
      get: vi.fn(),
      listByPosition: vi.fn(),
      saveSummary: vi.fn(),
    };
    const proposals = {
      list: vi.fn(() => ({ items: [], corruptItems: [], corruptCount: 0 })),
      get: vi.fn(),
      create: vi.fn(),
      commitReview: vi.fn(),
      commitCapabilityAnalysis: vi.fn(),
      accept: vi.fn(),
      ignore: vi.fn(),
    };
    const preview: InterviewReviewPreview = {
      token,
      provider: 'https://api.example.com',
      model: 'model-a',
      inputHash: 'a'.repeat(64),
      positionLabel: '远山科技 · AI 产品经理',
      roundName: '一面',
      outbound: {
        position: {
          id: positionId,
          company: '远山科技',
          title: 'AI 产品经理',
          location: '',
          rawJd: '负责 AI 产品。',
        },
        interview: {
          id: interviewId,
          positionId,
          roundName: '一面',
          interviewDate: null,
          transcript: '面试记录',
          personalNotes: '',
          feedbackResult: null,
        },
        prompt: '请复盘。',
        selectedAssets: {
          projects: [],
          questions: [],
          capabilities: [],
          insights: [],
        },
      },
      dataTypes: ['面试文字记录', '个人感受与补充', '岗位信息与原始 JD', '面试复盘 Prompt'],
    };
    const review = {
      preview: vi.fn(async () => preview),
      confirm: vi.fn(),
      cancelPreview: vi.fn(),
    };
    registerReviewHandlers({
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    }, interviews, proposals, review);

    await expect(handlers.get(CHANNELS.reviews.review.preview)!({}, {
      interviewId,
      prompt: 'renderer prompt',
      summary: 'renderer summary',
      proposals: [],
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(review.preview).not.toHaveBeenCalled();
    await expect(handlers.get(CHANNELS.reviews.review.confirm)!({}, {
      token,
      messages: [{ role: 'system', content: 'bypass' }],
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(review.confirm).not.toHaveBeenCalled();
  });

  it('validates interview responses at the main boundary', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const interviews = {
      create: vi.fn(() => ({ unexpected: true }) as unknown as Interview),
      update: vi.fn(),
      get: vi.fn(),
      listByPosition: vi.fn(),
      saveSummary: vi.fn(),
    };
    const proposals = {
      list: vi.fn(() => ({ items: [], corruptItems: [], corruptCount: 0 })),
      get: vi.fn(),
      create: vi.fn(),
      commitReview: vi.fn(),
      commitCapabilityAnalysis: vi.fn(),
      accept: vi.fn(),
      ignore: vi.fn(),
    };
    registerReviewHandlers({
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    }, interviews, proposals);

    await expect(handlers.get(CHANNELS.reviews.interviews.create)!({}, {
      positionId,
      roundName: '一面',
      interviewDate: '2026-07-27',
      transcript: '记录',
      personalNotes: '',
      feedbackResult: null,
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
