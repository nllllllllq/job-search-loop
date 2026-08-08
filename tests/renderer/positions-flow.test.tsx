import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  location: '',
  interest: 5,
  rawJd: '负责产品规划\n与用户研究 <script>alert(1)</script>',
  currentStage: 'interview',
  finalResult: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-27T00:00:00.000Z',
  stages,
  interviews: [],
};

const listItem: PositionListItem = {
  id: positionId,
  company: detail.company,
  title: detail.title,
  location: detail.location,
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

  it('keeps original company names separate and collapses rows by default', async () => {
    const aliasMember = {
      ...listItem,
      id: '8e4868e1-0da2-4fb7-b66f-5b55c5d5a212',
      company: '远山',
      title: '高级产品经理',
      currentStage: null,
    };
    const { fake, user } = renderAt('#/positions', (api) => {
      api.positions.listGrouped.mockResolvedValue([
        { canonicalName: '远山科技', members: [listItem] },
        { canonicalName: '远山', members: [aliasMember] },
      ]);
    });

    const header = await screen.findByText('远山科技', { selector: '.position-group-header strong' });
    expect(header.parentElement).toHaveTextContent('1 条记录');
    expect(header.parentElement).toHaveTextContent('2026-07-27');
    expect(within(header.closest('button')!).getByText('面试中')).toHaveClass('status-badge');
    expect(header.parentElement).not.toHaveTextContent('interview');
    expect(screen.queryByText('高级产品经理')).not.toBeInTheDocument();
    expect(screen.getByText('远山')).toBeInTheDocument();
    const unconfiguredHeader = screen.getByText('远山', { selector: '.position-group-header strong' });
    expect(within(unconfiguredHeader.closest('button')!).getByText('未设置')).toHaveClass('status-badge');
    await user.click(header.closest('button')!);
    expect(await screen.findByText('产品经理')).toBeInTheDocument();
    await user.click(header.closest('button')!);
    expect(screen.queryByText('产品经理')).not.toBeInTheDocument();
    expect(fake.positions.listGrouped).toHaveBeenCalledWith({});
  });

  it('shows role and location without repeating the company inside an expanded row', async () => {
    const located = { ...listItem, title: 'AI 产品经理', location: '上海 · 混合办公' };
    const { user } = renderAt('#/positions', (api) => {
      api.positions.listGrouped.mockResolvedValue([
        { canonicalName: located.company, members: [located] },
      ]);
    });

    await user.click(await screen.findByRole('button', { name: /远山科技/ }));
    const roleLink = screen.getByRole('link', { name: /AI 产品经理/ });
    expect(within(roleLink).getByText('AI 产品经理')).toBeVisible();
    expect(within(roleLink).getByText('上海 · 混合办公')).toBeVisible();
    expect(within(roleLink).queryByText('远山科技')).not.toBeInTheDocument();
  });

  it('opens position intake on screenshot recognition without a premature save action', async () => {
    const { user } = renderAt('#/positions');

    await user.click(await screen.findByRole('button', { name: '录入岗位' }));
    const dialog = screen.getByRole('dialog', { name: '录入岗位' });
    expect(within(dialog).getByRole('tab', { name: '截图识别' }))
      .toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).queryByRole('button', { name: '保存岗位' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '开始 AI 识别' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox', { name: /公司/ })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: '手动录入' }));
    expect(within(dialog).getByRole('textbox', { name: /公司/ })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: '保存岗位' })).toBeVisible();
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
    await user.click((await screen.findAllByRole('button', { name: '录入岗位' }))[0]);
    const dialog = screen.getByRole('dialog', { name: '录入岗位' });
    await user.click(within(dialog).getByRole('tab', { name: '手动录入' }));
    await user.type(within(dialog).getByRole('textbox', { name: /公司/ }), ' 远山科技 ');
    await user.type(within(dialog).getByRole('textbox', { name: /岗位名称/ }), '产品经理');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /兴趣度/ }), '5');
    await user.type(within(dialog).getByRole('textbox', { name: /原始 JD/ }), '负责产品规划与用户研究');
    await user.click(within(dialog).getByRole('button', { name: '保存岗位' }));

    await waitFor(() => {
      expect(fake.positions.create).toHaveBeenCalledWith({
        company: '远山科技',
        title: '产品经理',
        location: '',
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
    await user.click(screen.getByRole('tab', { name: '手动录入' }));
    await user.click(screen.getByRole('button', { name: '保存岗位' }));
    expect(await screen.findAllByText('请输入 1–120 个字符')).toHaveLength(2);
    expect(screen.getByText('请输入原始 JD')).toBeInTheDocument();
    expect(fake.positions.create).not.toHaveBeenCalled();

    await user.type(screen.getByRole('textbox', { name: /公司/ }), '远山科技');
    await user.type(screen.getByRole('textbox', { name: /岗位名称/ }), '产品经理');
    await user.type(screen.getByRole('textbox', { name: /原始 JD/ }), '  有意义的空白\n内容  ');
    await user.click(screen.getByRole('button', { name: '保存岗位' }));

    expect(await screen.findByText('岗位记录保存失败，请稍后重试')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '录入岗位' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /原始 JD/ })).toHaveValue('  有意义的空白\n内容  ');
    expect(screen.queryByText(/SQLITE/)).not.toBeInTheDocument();
  });

  it('sends deterministic query and canonical-stage filters and shows missing dates as an em dash', async () => {
    const { fake, user } = renderAt('#/positions');

    expect(await screen.findAllByText('远山科技')).toHaveLength(1);
    expect(screen.getByText(/最近更新 2026-07-27/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: '搜索岗位' }), '产品');
    await user.selectOptions(screen.getByRole('combobox', { name: '流程阶段' }), 'interview');
    await user.click(screen.getByRole('button', { name: '筛选' }));

    await waitFor(() => {
      expect(fake.positions.listGrouped).toHaveBeenLastCalledWith({
        query: '产品',
        stage: 'interview',
      });
    });
  });

  it('limits search input to the API schema maximum before filtering', async () => {
    const { fake, user } = renderAt('#/positions');
    const search = await screen.findByRole('textbox', { name: '搜索岗位' });
    const overlongQuery = '岗'.repeat(501);

    expect(search).toHaveAttribute('maxlength', '500');
    fireEvent.change(search, { target: { value: overlongQuery.slice(0, 500) } });
    expect(search).toHaveValue('岗'.repeat(500));
    await user.click(screen.getByRole('button', { name: '筛选' }));

    await waitFor(() => {
      expect(fake.positions.listGrouped).toHaveBeenLastCalledWith({
        query: '岗'.repeat(500),
      });
    });
  });

  it('renders raw JD directly as safe text with line breaks', async () => {
    renderAt(`#/positions/${positionId}`);

    expect(await screen.findByRole('heading', { name: '远山科技' })).toBeInTheDocument();
    const process = screen.getByRole('region', { name: '岗位流程' });
    const rawJd = screen.getByTestId('raw-jd');
    expect(process.compareDocumentPosition(rawJd) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rawJd).toHaveTextContent('负责产品规划 与用户研究 <script>alert(1)</script>');
    expect(rawJd).toHaveStyle({ whiteSpace: 'pre-wrap' });
    expect(document.querySelector('.raw-jd script')).toBeNull();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('keeps position intake open until its labelled close button is used', async () => {
    const { user } = renderAt('#/positions');

    await user.click((await screen.findAllByRole('button', { name: '录入岗位' }))[0]);
    const dialog = screen.getByRole('dialog', { name: '录入岗位' });
    expect(within(dialog).queryByRole('button', { name: '取消' })).not.toBeInTheDocument();

    fireEvent.click(dialog);
    fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
    expect(dialog).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '关闭对话框' }));
    expect(screen.queryByRole('dialog', { name: '录入岗位' })).not.toBeInTheDocument();
  });

  it('shows a compact preparation task status on the matching position row', async () => {
    const { fake } = renderAt('#/positions', (api) => {
      api.tasks.listByPosition.mockResolvedValue([{
        id: '33333333-3333-4333-8333-333333333333',
        kind: 'preparation',
        positionId,
        status: 'running',
        safeError: null,
        createdAt: '2026-08-01T00:00:00.000Z',
        startedAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      }]);
    });

    await userEvent.click(await screen.findByRole('button', { name: /远山科技/ }));
    expect(await screen.findByText('running')).toBeInTheDocument();
    expect(fake.tasks.listByPosition).toHaveBeenCalledWith(positionId);
  });

  it('shows the three compact node states and saves an edited interview stage', async () => {
    const emptyStage: ProcessStage = {
      ...stages[0],
      id: '41281f0a-7d48-4c25-a41c-f3a765a7cb58',
      name: '终面',
      actualDate: null,
      expectedDate: null,
      orderIndex: 3,
    };
    const { fake, user } = renderAt(`#/positions/${positionId}`, (api) => {
      api.positions.get.mockResolvedValue({ ...detail, stages: [...stages, emptyStage] });
    });

    const actualNode = await screen.findByRole('button', {
      name: '编辑流程阶段：已投递，已记录实际日期 2026-07-27',
    });
    const expectedNode = screen.getByRole('button', {
      name: '编辑流程阶段：面试，仅预计日期 2026-08-01',
    });
    expect(actualNode).toHaveAttribute('data-state', 'actual');
    expect(expectedNode).toHaveAttribute('data-state', 'expected');
    expect(screen.getByRole('button', { name: '编辑流程阶段：终面，未记录日期' }))
      .toHaveAttribute('data-state', 'empty');
    expect(screen.getByRole('button', { name: '新增流程阶段' })).toHaveAttribute('data-state', 'add');
    expect(screen.queryByText('已确认收到')).not.toBeInTheDocument();

    await user.click(expectedNode);
    const editor = screen.getByRole('dialog', { name: '编辑流程阶段' });
    await user.clear(within(editor).getByLabelText('预计日期'));
    await user.type(within(editor).getByLabelText('预计日期'), '2026-08-01');
    const order = within(editor).getByRole('spinbutton', { name: /显示顺序/ });
    await user.clear(order);
    await user.type(order, '1');
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
        orderIndex: 0,
      });
    });
    expect(fake.positions.get).toHaveBeenCalledTimes(2);
  });

  it('rejects an empty display order without silently moving it to the first position', async () => {
    const { fake, user } = renderAt(`#/positions/${positionId}`);
    await user.click(await screen.findByRole('button', { name: /编辑流程阶段：面试/ }));
    const editor = screen.getByRole('dialog', { name: '编辑流程阶段' });
    const order = within(editor).getByRole('spinbutton', { name: /显示顺序/ });

    expect(order).toBeRequired();
    await user.clear(order);
    await user.click(within(editor).getByRole('button', { name: '保存阶段' }));

    expect(await within(editor).findByText('请输入有效的显示顺序')).toBeInTheDocument();
    expect(order).toHaveValue(null);
    expect(fake.positions.saveStage).not.toHaveBeenCalled();
  });

  it('uses the whole stage node as the edit trigger', async () => {
    renderAt(`#/positions/${positionId}`);

    expect(await screen.findByRole('button', { name: /编辑流程阶段：面试/ }))
      .toHaveClass('stage-node');
  });

  it('adds stages from the plus node and uses a 1-based display order', async () => {
    const { fake, user } = renderAt(`#/positions/${positionId}`);
    await user.click(await screen.findByRole('button', { name: '新增流程阶段' }));
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
      orderIndex: 2,
    });
    expect(screen.queryByText('更多流程设置')).not.toBeInTheDocument();
    await waitFor(() => expect(fake.positions.get).toHaveBeenCalledTimes(2));
  });

  it('opens a dedicated confirmation from the hovered node delete action', async () => {
    let resolveRemoval: (value: ProcessStage[]) => void = () => undefined;
    const { fake, user } = renderAt(`#/positions/${positionId}`, (api) => {
      api.positions.removeStage.mockImplementation(() => new Promise((resolve) => {
        resolveRemoval = resolve;
      }));
    });
    await user.click(await screen.findByRole('button', { name: '删除流程阶段：面试' }));
    expect(fake.positions.removeStage).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: '确认删除节点' });
    expect(within(dialog).getByText(/日期、反馈和备注/)).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByRole('dialog', { name: '编辑流程阶段' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '确认删除节点' }));

    await waitFor(() => expect(fake.positions.removeStage).toHaveBeenCalledWith(
      positionId,
      interviewStageId,
    ));
    resolveRemoval([]);
    await waitFor(() => expect(fake.positions.get).toHaveBeenCalledTimes(2));
  });

  it('does not open a context menu for stage nodes', async () => {
    const { fake } = renderAt(`#/positions/${positionId}`);
    const interviewNode = await screen.findByRole('button', { name: /编辑流程阶段：面试/ });
    fireEvent.contextMenu(interviewNode, { clientX: 48, clientY: 64 });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(fake.positions.removeStage).not.toHaveBeenCalled();
  });

  it('shows only the add node when a position has no stages', async () => {
    renderAt(`#/positions/${positionId}`, (api) => {
      api.positions.get.mockResolvedValue({ ...detail, currentStage: null, stages: [] });
    });

    expect(await screen.findByRole('button', { name: '新增流程阶段' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /编辑流程阶段/ })).not.toBeInTheDocument();
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
      api.positions.listGrouped.mockRejectedValue(new Error('SQL table positions'));
    });
    expect(await screen.findByRole('heading', { name: '岗位读取失败' })).toBeInTheDocument();
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

  it('retains Cancel and Confirm actions in the position delete confirmation', async () => {
    const { fake, user } = renderAt(`#/positions/${positionId}`);

    await user.click(await screen.findByRole('button', { name: '删除岗位' }));
    const dialog = screen.getByRole('dialog', { name: '确认删除岗位' });
    expect(within(dialog).getByRole('button', { name: '取消' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '确认删除' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(fake.positions.remove).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: '确认删除岗位' })).not.toBeInTheDocument();
  });

  it('captures and displays a position location on the main path', async () => {
    const locatedDetail = { ...detail, location: '上海 · 混合办公' };
    const locatedItem = { ...listItem, location: locatedDetail.location };
    const { fake, user } = renderAt('#/positions', (api) => {
      api.positions.list.mockResolvedValue([locatedItem]);
      api.positions.listGrouped.mockResolvedValue([{ canonicalName: locatedItem.company, members: [locatedItem] }]);
      api.positions.create.mockResolvedValue(locatedDetail);
      api.positions.get.mockResolvedValue(locatedDetail);
    });

    await screen.findByText('远山科技');
    await user.click(screen.getByRole('button', { name: '录入岗位' }));
    const dialog = screen.getByRole('dialog', { name: '录入岗位' });
    await user.click(within(dialog).getByRole('tab', { name: '手动录入' }));
    await user.type(within(dialog).getByRole('textbox', { name: /公司/ }), '远山科技');
    await user.type(within(dialog).getByRole('textbox', { name: /岗位名称/ }), '产品经理');
    await user.type(within(dialog).getByRole('textbox', { name: /位置/ }), '上海');
    await user.type(within(dialog).getByRole('textbox', { name: /原始 JD/ }), '负责产品规划');
    await user.click(within(dialog).getByRole('button', { name: '保存岗位' }));

    await waitFor(() => expect(fake.positions.create).toHaveBeenCalledWith(
      expect.objectContaining({ location: '上海' }),
    ));
  });

  it('opens a compact single-page workspace with JD, process, preparation and interviews', async () => {
    renderAt(`#/positions/${positionId}`);

    expect(await screen.findByTestId('raw-jd')).toHaveTextContent('负责产品规划');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '推进记录' })).toBeInTheDocument();
    expect(screen.getByText('准备材料')).toBeInTheDocument();
    expect(screen.getByText('面试记录')).toBeInTheDocument();
  });

  it('opens stage editing by clicking a stage card', async () => {
    const { user } = renderAt(`#/positions/${positionId}`);

    await user.click(await screen.findByRole('button', { name: /编辑流程阶段：面试/ }));
    expect(screen.getByRole('dialog', { name: '编辑流程阶段' })).toBeInTheDocument();
  });
});
