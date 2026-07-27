import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  REUSABLE_QUESTION,
  startFakeAiServer,
  type FakeAiServer,
} from './fixtures/fake-ai-server';

async function launchTestApp(userData: string): Promise<ElectronApplication> {
  return electron.launch({
    // The Codex Windows runner itself blocks Chromium's child-process sandbox.
    // Production still creates a sandboxed BrowserWindow; this test-only flag
    // lets the real renderer run inside the already isolated test workspace.
    args: ['.', '--disable-gpu', '--no-sandbox'],
    env: {
      ...process.env,
      JOB_SEARCH_LOOP_E2E: '1',
      JOB_SEARCH_LOOP_USER_DATA: userData,
    },
  });
}

async function openWindow(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow();
  await expect(page.getByRole('link', { name: '岗位' })).toBeVisible();
  return page;
}

async function configureAi(page: Page, server: FakeAiServer): Promise<void> {
  await page.getByRole('link', { name: '设置' }).click();
  await page.getByLabel('API 地址').fill(server.baseUrl);
  await page.getByLabel('模型').fill('fake-e2e-model');
  await page.getByLabel('替换 API Key').fill('e2e-only-key');
  await page.getByRole('button', { name: '保存 AI 配置' }).click();
  await expect(page.getByText('密钥已安全保存在本机', { exact: true })).toBeVisible();
}

async function createPosition(
  page: Page,
  input: { company: string; title: string; rawJd: string },
): Promise<void> {
  await page.getByRole('link', { name: '岗位' }).click();
  await page.getByRole('button', { name: /录入岗位/ }).click();
  await page.getByLabel('公司').fill(input.company);
  await page.getByLabel('岗位名称').fill(input.title);
  await page.getByLabel('兴趣度').selectOption('5');
  await page.getByLabel('原始 JD').fill(input.rawJd);
  await page.getByRole('button', { name: '保存岗位' }).click();
  await expect(page.getByRole('heading', { name: input.company })).toBeVisible();
}

async function generatePreparation(
  page: Page,
  server: FakeAiServer,
  question?: string,
): Promise<void> {
  await page.getByRole('tab', { name: '准备材料' }).click();
  await page.getByRole('button', { name: '生成准备材料' }).click();
  if (question) {
    await page.getByLabel(`问题：${question}`).check();
  }
  await page.getByRole('button', { name: '查看发送摘要' }).click();
  await expect(page.getByRole('heading', { name: '预计载荷摘要' })).toBeVisible();
  expect(server.requests).toHaveLength(2);
  await page.getByRole('button', { name: '确认生成' }).click();
  await expect(page.getByRole('heading', { name: '岗位摘要' }).first()).toBeVisible();
}

test('turns one interview into reusable preparation for the next job', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'job-search-loop-e2e-'));
  const server = await startFakeAiServer();
  let app: ElectronApplication | null = null;

  try {
    app = await launchTestApp(userData);
    let page = await openWindow(app);
    await configureAi(page, server);
    expect(server.requests).toHaveLength(0);

    await createPosition(page, {
      company: '远山科技',
      title: 'AI 产品经理',
      rawJd: '需要用户研究、产品规划和跨团队协作能力。',
    });

    await page.getByRole('tab', { name: '流程' }).click();
    await page.getByRole('button', { name: '编辑 面试' }).click();
    await page.getByLabel('实际日期').fill('2026-08-01');
    await page.getByRole('button', { name: '保存阶段' }).click();
    await expect(page.getByText('实际日期：2026-08-01')).toBeVisible();

    await page.getByRole('tab', { name: '准备材料' }).click();
    await page.getByRole('button', { name: '生成准备材料' }).click();
    await page.getByRole('button', { name: '查看发送摘要' }).click();
    await expect(page.getByRole('heading', { name: '预计载荷摘要' })).toBeVisible();
    expect(server.requests).toHaveLength(0);
    await page.getByRole('button', { name: '确认生成' }).click();
    await expect.poll(() => server.requests.length).toBe(1);
    await expect(page.getByRole('heading', { name: '岗位摘要' })).toBeVisible();

    await page.getByRole('tab', { name: '面试记录' }).click();
    await page.getByRole('button', { name: '新增面试记录' }).click();
    await page.getByLabel('轮次').fill('一面');
    await page.getByLabel('面试日期').fill('2026-08-01');
    await page.getByLabel('已确认文字记录').fill('面试官询问了用户研究方法，以及如何把研究结论转化为产品决策。');
    await page.getByLabel('个人感受 / 补充').fill('回答结构清楚，但业务结果证据不足。');
    await page.getByRole('button', { name: '保存面试记录' }).click();
    await expect(page.getByText('面试官询问了用户研究方法，以及如何把研究结论转化为产品决策。')).toBeVisible();

    await page.getByRole('button', { name: '开始 AI 复盘' }).click();
    await page.getByRole('button', { name: '预览发送内容' }).click();
    await expect(page.getByRole('heading', { name: '确认发送复盘数据' })).toBeVisible();
    expect(server.requests).toHaveLength(1);
    await page.getByRole('button', { name: '确认并开始复盘' }).click();
    await expect.poll(() => server.requests.length).toBe(2);
    await expect(page.getByText('候选人能够说明用户研究方法，但需要补充业务影响证据。')).toBeVisible();

    await page.getByRole('link', { name: '复盘中心' }).click();
    const questionProposal = page.locator('article.proposal-card').filter({
      hasText: REUSABLE_QUESTION,
    });
    await expect(questionProposal).toBeVisible();
    await questionProposal.getByRole('button', { name: '接受', exact: true }).click();
    await expect(questionProposal.getByText('已接受')).toBeVisible();

    await createPosition(page, {
      company: '海川软件',
      title: '产品运营',
      rawJd: '要求用户洞察和跨团队协作。',
    });
    await generatePreparation(page, server, REUSABLE_QUESTION);
    await expect.poll(() => server.requests.length).toBe(3);
    expect(server.requests[2]?.body).toContain(REUSABLE_QUESTION);
    for (const request of server.requests) {
      expect(request.method).toBe('POST');
      expect(request.path).toBe('/v1/chat/completions');
      expect(request.headers.authorization).toBe('Bearer e2e-only-key');
    }
    await expect(page.getByText(/1 个问题/)).toBeVisible();

    await app.close();
    app = await launchTestApp(userData);
    page = await openWindow(app);
    await page.getByRole('link', { name: '岗位', exact: true }).click();
    const positionTable = page.locator('table.position-table');
    await expect(positionTable.getByRole('link', { name: /远山科技/ })).toBeVisible();
    await expect(positionTable.getByRole('link', { name: /海川软件/ })).toBeVisible();
    await page.getByRole('link', { name: '问题库' }).click();
    await expect(page.getByText(REUSABLE_QUESTION)).toBeVisible();
  } finally {
    if (app) await app.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});
