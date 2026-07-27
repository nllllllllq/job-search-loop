import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';
import type { PositionDetail, PositionListItem, ProcessStage } from '../../src/shared/domain';
import { installJobSearchFake, createJobSearchFake, type JobSearchApiFake } from '../helpers/bridge';

const positionId = '4acdf6d3-9e22-4f0f-9684-0324cb8ecad5';
const interviewStageId = '77201177-eeac-4f69-8be7-03da9f5ee3e5';
const appliedStageId = 'f560605d-f716-4756-a93d-e7766647242b';

const stages: ProcessStage[] = [
  {
    id: interviewStageId,
    positionId,
    name: '面试',
    canonicalStage: 'interview',
    actualDate: null,
    expectedDate: '2026-08-01',
    feedback: '',
    notes: '',
    orderIndex: 2,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: appliedStageId,
    positionId,
    name: '已投递',
    canonicalStage: 'applied',
    actualDate: '2026-07-27',
    expectedDate: null,
    feedback: '已确认收到',
    notes: '',
    orderIndex: 1,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
  },
];

const detail: PositionDetail = {
  id: positionId,
  company: '远山科技',
  title: '产品经理',
  interest: 5,
  rawJd: '负责产品规划\n与用户研究 <script>alert(1)</script>',
  currentStage: 'interview',
  finalResult: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-27T00:00:00.000Z',
  stages,
  preparations: [],
  interviews: [],
};

const listItem: PositionListItem = {
  id: positionId,
  company: detail.company,
  title: detail.title,
  interest: detail.interest,
  currentStage: detail.currentStage,
  finalResult: detail.finalResult,
  updatedAt: detail.updatedAt,
};

function renderAt(hash: string, configure?: (fake: JobSearchApiFake) => void) {
  window.location.hash = hash;
  const fake = createJobSearchFake();
  fake.positions.list.mockResolvedValue([listItem]);
  fake.positions.get.mockResolvedValue(detail);
  configure?.(fake);
  installJobSearchFake(fake);
  return { fake, user: userEvent.setup(), ...render(<App />) };
}

describe('positions flow', () => {
  beforeEach(() => {
    window.location.hash = '#/';
    document.title = '测试宿主';
  });

  afterEach(() => {
    window.location.hash = '';
    document.title = '';
  });

  it('creates a position, refreshes, and routes to the created record', async () => {
    const created = { ...detail, rawJd: '负责产品规划与用户研究' };
    const { fake, user } = renderAt('#/', (api) => {
      api.positions.list
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([listItem]);
      api.positions.create.mockResolvedValue(created);
      api.positions.get.mockResolvedValue(created);
    });

    await user.click(screen.getByRole('link', { name: '岗位' }));
    await user.click(await screen.findByRole('button', { name: '录入岗位' }));
    const dialog = screen.getByRole('dialog', { name: '录入岗位' });
    await user.type(within(dialog).getByRole('textbox', { name: /公司/ }), ' 远山科技 ');
    await user.type(within(dialog).getByRole('textbox', { name: /岗位名称/ }), '产品经理');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /兴趣度/ }), '5');
    await user.type(within(dialog).getByRole('textbox', { name: /原始 JD/ }), '负责产品规划与用户研究');
    await user.click(within(dialog).getByRole('button', { name: '保存岗位' }));

    await waitFor(() => {
      expect(fake.positions.create).toHaveBeenCalledWith({
        company: '远山科技',
        title: '产品经理',
        interest: 5,
        rawJd: '负责产品规划与用户研究',
      });
    });
    expect(fake.positions.list).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('heading', { name: '远山科技' })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/positions/${positionId}`);
    expect(screen.getByText('岗位记录已保存')).toBeInTheDocument();
  });

  it('validates required values and keeps entered data after an API failure', async () => {
    const { fake, user } = renderAt('#/positions', (api) => {
      api.positions.create.mockRejectedValue({
        code: 'INTERNAL_ERROR',
        message: 'SQLITE_CONSTRAINT secret',
      });
    });

    await user.click(await screen.findByRole('button', { name: '录入岗位' }));
    await user.click(screen.getByRole('button', { name: '保存岗位' }));
    expect(await screen.findAllByText('请输入 1–120 个字符')).toHaveLength(2);
    expect(screen.getByText('请输入原始 JD')).toBeInTheDocument();
    expect(fake.positions.create).not.toHaveBeenCalled();

    await user.type(screen.getByRole('textbox', { name: /公司/ }), '远山科技');
    await user.type(screen.getByRole('textbox', { name: /岗位名称/ }), '产品经理');
    await user.type(screen.getByRole('textbox', { name: /原始 JD/ }), '  有意义的空白\n内容  ');
    await user.click(screen.getByRole('button', { name: '保存岗位' }));

    expect(await screen.findByText('保存岗位失败，请稍后重试')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '录入岗位' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /原始 JD/ })).toHaveValue('  有意义的空白\n内容  ');
    expect(screen.queryByText(/SQLITE/)).not.toBeInTheDocument();
  });

  it('sends deterministic query and canonical-stage filters and shows missing dates as an em dash', async () => {
    const { fake, user } = renderAt('#/positions');

    expect(await screen.findByText('远山科技')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '暂无最近流程日期' })).toHaveTextContent('—');
    await user.type(screen.getByRole('searchbox', { name: '搜索岗位' }), '产品');
    await user.selectOptions(screen.getByRole('combobox', { name: '流程阶段' }), 'interview');
    await user.click(screen.getByRole('button', { name: '筛选' }));

    await waitFor(() => {
      expect(fake.positions.list).toHaveBeenLastCalledWith({
        query: '产品',
        stage: 'interview',
      });
    });
  });

  it('shows exact detail tabs and renders raw JD as safe text with line breaks', async () => {
    renderAt(`#/positions/${positionId}`);

    expect(await screen.findByRole('heading', { name: '远山科技' })).toBeInTheDocument();
    for (const tab of ['概况', '原始 JD', '流程', '准备材料', '面试记录']) {
      expect(screen.getByRole('tab', { name: tab })).toBeInTheDocument();
    }

    await userEvent.click(screen.getByRole('tab', { name: '原始 JD' }));
    const rawJd = screen.getByTestId('raw-jd');
    expect(rawJd).toHaveTextContent('负责产品规划 与用户研究 <script>alert(1)</script>');
    expect(rawJd).toHaveStyle({ whiteSpace: 'pre-wrap' });
    expect(document.querySelector('.raw-jd script')).toBeNull();
  });

  it('labels expected and actual dates explicitly and saves an edited interview stage', async () => {
    const { fake, user } = renderAt(`#/positions/${positionId}`);
    await user.click(await screen.findByRole('tab', { name: '流程' }));

    expect(screen.getByText('实际日期：2026-07-27')).toBeInTheDocument();
    expect(screen.getByText('预计日期：2026-08-01')).toBeInTheDocument();
    expect(screen.getByText('日期仅用于记录流程，不会创建提醒')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '编辑 面试' }));
    const editor = screen.getByRole('dialog', { name: '编辑流程阶段' });
    await user.clear(within(editor).getByLabelText('预计日期'));
    await user.type(within(editor).getByLabelText('预计日期'), '2026-08-01');
    await user.click(within(editor).getByRole('button', { name: '保存阶段' }));

    await waitFor(() => {
      expect(fake.positions.saveStage).toHaveBeenCalledWith({
        id: interviewStageId,
        positionId,
        name: '面试',
        canonicalStage: 'interview',
        actualDate: null,
        expectedDate: '2026-08-01',
        feedback: '',
        notes: '',
        orderIndex: 2,
      });
    });
    expect(fake.positions.get).toHaveBeenCalledTimes(2);
  });

  it('adds stages, reorders existing stages, and refreshes detail after each mutation', async () => {
    const { fake, user } = renderAt(`#/positions/${positionId}`);
    await user.click(await screen.findByRole('tab', { name: '流程' }));

    await user.click(screen.getByRole('button', { name: '新增阶段' }));
    const editor = screen.getByRole('dialog', { name: '新增流程阶段' });
    await user.type(within(editor).getByRole('textbox', { name: /阶段名称/ }), '业务复试');
    await user.selectOptions(within(editor).getByRole('combobox', { name: /标准阶段/ }), 'interview');
    await user.click(within(editor).getByRole('button', { name: '保存阶段' }));

    expect(fake.positions.saveStage).toHaveBeenCalledWith({
      positionId,
      name: '业务复试',
      canonicalStage: 'interview',
      actualDate: null,
      expectedDate: null,
      feedback: '',
      notes: '',
      orderIndex: 3,
    });

    await user.click(screen.getByRole('button', { name: '上移 面试' }));
    expect(fake.positions.reorderStages).toHaveBeenCalledWith(positionId, [
      interviewStageId,
      appliedStageId,
    ]);
    await waitFor(() => expect(fake.positions.get).toHaveBeenCalledTimes(3));
  });

  it('edits a position without losing values when the API fails', async () => {
    const { fake, user } = renderAt(`#/positions/${positionId}`, (api) => {
      api.positions.update.mockRejectedValue(new Error('disk failed'));
    });

    await user.click(await screen.findByRole('button', { name: '编辑岗位' }));
    await user.clear(screen.getByRole('textbox', { name: /岗位名称/ }));
    await user.type(screen.getByRole('textbox', { name: /岗位名称/ }), '高级产品经理');
    await user.click(screen.getByRole('button', { name: '保存岗位' }));

    expect(await screen.findByText('保存岗位失败，请稍后重试')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /岗位名称/ })).toHaveValue('高级产品经理');
    expect(fake.positions.update).toHaveBeenCalled();
  });

  it('requires explicit confirmation before deleting and returns to the list', async () => {
    const { fake, user } = renderAt(`#/positions/${positionId}`);

    await user.click(await screen.findByRole('button', { name: '删除岗位' }));
    expect(fake.positions.remove).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: '确认删除岗位' });
    await user.click(within(dialog).getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(fake.positions.remove).toHaveBeenCalledWith(positionId));
    expect(window.location.hash).toBe('#/positions');
    expect(await screen.findByText('岗位记录已删除')).toBeInTheDocument();
  });

  it('shows safe loading errors and not-found states', async () => {
    const first = renderAt('#/positions', (api) => {
      api.positions.list.mockRejectedValue(new Error('SQL table positions'));
    });
    expect(await screen.findByRole('heading', { name: '岗位载入失败' })).toBeInTheDocument();
    expect(screen.queryByText(/SQL table/)).not.toBeInTheDocument();
    first.unmount();

    const second = renderAt(`#/positions/${positionId}`, (api) => {
      api.positions.get.mockRejectedValue({ code: 'NOT_FOUND', message: 'not found' });
    });
    expect(await screen.findByRole('heading', { name: '没有找到这条岗位记录' })).toBeInTheDocument();
    second.unmount();

    renderAt(`#/positions/${positionId}`, (api) => {
      api.positions.get.mockRejectedValue({ code: 'INTERNAL_ERROR', message: 'SQL secret' });
    });
    expect(await screen.findByRole('heading', { name: '岗位详情载入失败' })).toBeInTheDocument();
    expect(screen.queryByText(/SQL secret/)).not.toBeInTheDocument();
  });
});
