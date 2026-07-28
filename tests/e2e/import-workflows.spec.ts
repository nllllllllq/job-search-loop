import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function launchTestApp(userData: string): Promise<ElectronApplication> {
  return electron.launch({
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
  await expect(page.getByRole('link', { name: '岗位', exact: true })).toBeVisible();
  return page;
}

test('imports a pasted position and a TXT project through user-confirmed previews', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'job-search-loop-import-e2e-'));
  let app: ElectronApplication | null = null;

  try {
    app = await launchTestApp(userData);
    const page = await openWindow(app);

    await page.getByRole('link', { name: '岗位', exact: true }).click();
    await page.getByRole('button', { name: /录入岗位/ }).click();
    await page.getByRole('tab', { name: '粘贴文本' }).click();
    await page.getByLabel('粘贴岗位文本').fill([
      '公司：远山科技',
      '岗位：AI 产品经理',
      '地点：上海',
      '岗位职责：',
      '负责 AI 产品规划、用户研究和跨团队协作。',
      '根据用户反馈迭代产品方案，并跟踪业务结果。',
    ].join('\n'));
    await page.getByRole('button', { name: '解析文本' }).click();

    await expect(page.getByRole('textbox', { name: /^公司/ })).toHaveValue('远山科技');
    await expect(page.getByRole('textbox', { name: /^岗位名称/ })).toHaveValue('AI 产品经理');
    await expect(page.getByRole('textbox', { name: /^位置/ })).toHaveValue('上海');
    await page.getByRole('button', { name: '保存岗位' }).click();

    await expect(page.getByRole('heading', { name: '远山科技' })).toBeVisible();
    await expect(page.getByText('AI 产品经理', { exact: true })).toBeVisible();
    await expect(page.getByText('上海', { exact: true })).toBeVisible();
    await expect(page.getByTestId('raw-jd')).toContainText('负责 AI 产品规划');
    await expect(page.getByRole('button', { name: '编辑流程阶段：感兴趣' })).toBeVisible();
    await expect(page.getByRole('button', { name: '编辑流程阶段：已投递' })).toBeVisible();
    await expect(page.getByRole('button', { name: '编辑流程阶段：面试' })).toBeVisible();
    await expect(page.getByRole('button', { name: '编辑流程阶段：Offer' })).toBeVisible();

    await page.getByRole('link', { name: '项目档案' }).click();
    await page.getByRole('button', { name: '从文件导入' }).click();
    await page.getByLabel('选择项目文件').setInputFiles({
      name: 'projects.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from([
        '# 智能问答项目',
        '背景：客服重复问题多，响应速度慢。',
        '目标：降低人工处理量并提升首响速度。',
        '角色：产品负责人',
        '关键决策：先覆盖高频问题，再逐步扩展。',
        '结果：首响时间缩短 40%。',
      ].join('\n')),
    });
    await page.getByRole('button', { name: '解析文件' }).click();

    await expect(page.getByLabel('项目 1 名称')).toHaveValue('智能问答项目');
    await page.getByRole('button', { name: '进入字段确认' }).click();
    await expect(page.getByRole('textbox', { name: '项目名称' })).toHaveValue('智能问答项目');
    await page.getByRole('button', { name: '保存 1 个项目' }).click();

    await expect(page.getByText('项目文件已导入', { exact: true })).toBeVisible();
    await expect(page.getByText('智能问答项目', { exact: true }).first()).toBeVisible();
  } finally {
    if (app) await app.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});
