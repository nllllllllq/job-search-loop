import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AiTask, CanonicalStage, PositionInput, PositionListItem } from '../../../shared/domain';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { useToast } from '../../hooks/useToast';
import { PositionIntakePanel } from './PositionIntakePanel';

const stageOptions: Array<{ label: string; value: CanonicalStage }> = [
  { label: '感兴趣', value: 'interested' },
  { label: '已投递', value: 'applied' },
  { label: '测评中', value: 'assessment' },
  { label: '面试中', value: 'interview' },
  { label: '已录用', value: 'offer' },
  { label: '未通过', value: 'rejected' },
  { label: '已撤回', value: 'withdrawn' },
];

interface PositionFilter {
  query?: string;
  stage?: CanonicalStage;
}

function newestTask(tasks: AiTask[]): AiTask | null {
  return [...tasks].sort((left, right) => (
    new Date(right.updatedAt).valueOf() - new Date(left.updatedAt).valueOf()
  ))[0] ?? null;
}

function PreparationTaskBadge({ task }: { task: AiTask | null }) {
  if (!task || task.status === 'succeeded') return null;
  const label = task.status === 'queued' || task.status === 'running'
    ? '准备材料生成中'
    : task.status === 'interrupted'
      ? '准备材料已中断'
      : '准备材料生成失败';
  return <span aria-label={label} className={`preparation-task-badge preparation-task-badge--${task.status}`}>{label}</span>;
}

export function PositionsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<CanonicalStage | ''>('');
  const [filter, setFilter] = useState<PositionFilter>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [canonicalName, setCanonicalName] = useState('');
  const [alias, setAlias] = useState('');
  const filterKey = `${filter.query ?? ''}|${filter.stage ?? ''}`;
  const resource = useAsyncResource(
    () => window.jobSearch.positions.listGrouped(filter),
    [filterKey],
  );
  const [preparationTasks, setPreparationTasks] = useState<Record<string, AiTask | null>>({});

  useEffect(() => {
    const positions = (resource.data ?? []).flatMap((group) => group.members);
    if (positions.length === 0) {
      setPreparationTasks({});
      return undefined;
    }
    let active = true;
    const loadTasks = async () => {
      const entries = await Promise.all(positions.map(async (position: PositionListItem) => {
        try {
          return [position.id, newestTask(await window.jobSearch.tasks.listByPosition(position.id))] as const;
        } catch {
          return [position.id, null] as const;
        }
      }));
      if (active) setPreparationTasks(Object.fromEntries(entries));
    };
    void loadTasks();
    const timer = window.setInterval(() => void loadTasks(), 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [resource.data]);

  const countLabel = useMemo(() => {
    if (!resource.data) return '';
    return `${resource.data.reduce((count, group) => count + group.members.length, 0)} 条记录`;
  }, [resource.data]);

  const companyCandidates = resource.data?.map((group) => group.canonicalName) ?? [];
  const selectedCanonicalName = companyCandidates.includes(canonicalName)
    ? canonicalName
    : companyCandidates[0] ?? '';
  const selectedAlias = companyCandidates.includes(alias) && alias !== selectedCanonicalName
    ? alias
    : companyCandidates.find((name) => name !== selectedCanonicalName) ?? '';

  const applyFilter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilter({
      ...(query.trim() ? { query: query.trim() } : {}),
      ...(stage ? { stage } : {}),
    });
  };

  const createPosition = async (input: PositionInput) => {
    try {
      const created = await window.jobSearch.positions.create(input);
      await resource.reload();
      setEditorOpen(false);
      toast.success('岗位记录已保存');
      navigate(`/positions/${created.id}`);
    } catch {
      toast.error('保存岗位失败，请稍后重试');
      throw new Error('position create failed');
    }
  };

  const confirmCompanyAlias = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCanonicalName || !selectedAlias || selectedCanonicalName === selectedAlias) return;
    try {
      await window.jobSearch.companyAliases.confirm({
        canonicalName: selectedCanonicalName,
        alias: selectedAlias,
      });
      await resource.reload();
      toast.success('公司别名已确认');
    } catch {
      toast.error('确认公司别名失败，请重新选择');
    }
  };

  const removeCompanyAlias = async (companyAlias: string) => {
    try {
      await window.jobSearch.companyAliases.remove(companyAlias);
      await resource.reload();
      toast.success('公司别名确认已撤销');
    } catch {
      toast.error('撤销公司别名失败，请稍后重试');
    }
  };

  return (
    <div className="positions-page">
      <section className="page-heading">
        <div>
          <p className="section-label">机会台账 / POSITION LEDGER</p>
          <h2>把机会放进一条可回看的线索里</h2>
          <p>记录原始岗位信息与真实流程日期，让下一步始终有上下文。</p>
        </div>
        <button className="button button--primary" onClick={() => setEditorOpen(true)} type="button">
          <span aria-hidden="true">＋</span>
          录入岗位
        </button>
      </section>

      <form className="position-filter" onSubmit={applyFilter}>
        <label>
          <span>搜索岗位</span>
          <input
            aria-label="搜索岗位"
            maxLength={500}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="公司、岗位、位置或 JD 关键词"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span>流程阶段</span>
          <select
            aria-label="流程阶段"
            onChange={(event) => setStage(event.target.value as CanonicalStage | '')}
            value={stage}
          >
            <option value="">全部阶段</option>
            {stageOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button className="button button--quiet" type="submit">筛选</button>
        <span className="position-filter__count" aria-live="polite">{countLabel}</span>
      </form>

      {companyCandidates.length > 1 ? (
        <form aria-label="确认公司别名" className="position-filter" onSubmit={confirmCompanyAlias}>
          <span>仅在你确认后才会合并公司记录。</span>
          <label>
            <span>规范公司</span>
            <select
              aria-label="规范公司"
              onChange={(event) => setCanonicalName(event.target.value)}
              value={selectedCanonicalName}
            >
              {companyCandidates.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>
            <span>别名公司</span>
            <select
              aria-label="别名公司"
              onChange={(event) => setAlias(event.target.value)}
              value={selectedAlias}
            >
              {companyCandidates.filter((name) => name !== selectedCanonicalName).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <button className="button button--quiet" type="submit">确认合并公司</button>
        </form>
      ) : null}

      {resource.loading ? (
        <div className="resource-state" role="status">
          <span className="resource-state__mark" aria-hidden="true" />
          正在整理岗位台账…
        </div>
      ) : null}

      {!resource.loading && resource.error ? (
        <EmptyState
          action={<button className="button button--quiet" onClick={() => void resource.reload()} type="button">重新载入</button>}
          body="暂时无法读取本机岗位记录。请稍后重试。"
          icon="!"
          title="岗位载入失败"
        />
      ) : null}

      {!resource.loading && !resource.error && resource.data?.length === 0 ? (
        <EmptyState
          body={filter.query || filter.stage ? '当前筛选条件下没有岗位，调整条件后再试。' : '从一条真实岗位开始，保留 JD 原文并记录每次流程推进。'}
          icon="岗"
          title={filter.query || filter.stage ? '没有匹配的岗位' : '还没有岗位记录'}
        />
      ) : null}

      {!resource.loading && !resource.error && resource.data && resource.data.length > 0 ? (
        <div className="position-table-wrap">
          <table className="position-table">
            <thead>
              <tr>
                <th scope="col">公司 / 岗位 / 位置</th>
                <th scope="col">兴趣度</th>
                <th scope="col">当前阶段</th>
                <th scope="col">最近流程日期</th>
                <th scope="col">结果</th>
              </tr>
            </thead>
            <tbody>
              {resource.data.flatMap((group) => [
                <tr className="position-group-header" key={`${group.canonicalName}-header`}>
                  <th colSpan={5} scope="rowgroup">
                    <strong>{group.canonicalName}</strong>
                    <span>{group.members.length} 条记录</span>
                    {[...new Set(group.members.map((member) => member.company))]
                      .filter((companyAlias) => companyAlias !== group.canonicalName)
                      .map((companyAlias) => (
                        <button
                          className="button button--quiet"
                          key={companyAlias}
                          onClick={() => void removeCompanyAlias(companyAlias)}
                          type="button"
                        >
                          撤销别名 {companyAlias}
                        </button>
                      ))}
                  </th>
                </tr>,
                ...group.members.map((position) => (
                  <tr key={position.id}>
                    <th scope="row">
                      <Link to={`/positions/${position.id}`}>
                        <strong>{position.company}</strong>
                        <span>{position.title}</span>
                        <PreparationTaskBadge task={preparationTasks[position.id] ?? null} />
                        {position.location ? (
                          <small className="position-location">{position.location}</small>
                        ) : null}
                      </Link>
                    </th>
                    <td><span className="interest-score">{position.interest}<small>/5</small></span></td>
                    <td><StatusBadge stage={position.currentStage ?? undefined} /></td>
                    <td aria-label="暂无最近流程日期" className="muted-cell">—</td>
                    <td aria-label={position.finalResult ? undefined : '暂无结果'} className="muted-cell">{position.finalResult ?? '—'}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      ) : null}

      <PositionIntakePanel
        onClose={() => setEditorOpen(false)}
        onSave={createPosition}
        open={editorOpen}
      />
    </div>
  );
}
