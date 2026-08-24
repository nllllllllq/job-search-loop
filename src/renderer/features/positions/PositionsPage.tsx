import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AiTask, CanonicalStage, PositionInput } from '../../../shared/domain';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { useToast } from '../../hooks/useToast';
import { PositionIntakePanel } from './PositionIntakePanel';

const stageOptions: Array<{ label: string; value: CanonicalStage }> = [
  { label: 'Interested', value: 'interested' }, { label: 'Applied', value: 'applied' },
  { label: 'Assessment', value: 'assessment' }, { label: 'Interview', value: 'interview' },
  { label: 'Offer', value: 'offer' }, { label: 'Rejected', value: 'rejected' }, { label: 'Withdrawn', value: 'withdrawn' },
];

function newestTask(tasks: AiTask[]): AiTask | null {
  return [...tasks].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
}

export function PositionsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<CanonicalStage | ''>('');
  const [filter, setFilter] = useState<{ query?: string; stage?: CanonicalStage }>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const resource = useAsyncResource(() => window.jobSearch.positions.listGrouped(filter), [`${filter.query ?? ''}|${filter.stage ?? ''}`]);
  const [preparationTasks, setPreparationTasks] = useState<Record<string, AiTask | null>>({});

  useEffect(() => {
    const positions = (resource.data ?? []).flatMap((g) => g.members);
    if (!positions.length) return undefined;
    let active = true;
    const load = async () => {
      const entries = await Promise.all(positions.map(async (p) => [p.id, newestTask(await window.jobSearch.tasks.listByPosition(p.id))] as const));
      if (active) setPreparationTasks(Object.fromEntries(entries));
    };
    void load();
    const timer = window.setInterval(() => void load(), 2500);
    return () => { active = false; window.clearInterval(timer); };
  }, [resource.data]);

  const applyFilter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilter({ ...(query.trim() ? { query: query.trim() } : {}), ...(stage ? { stage } : {}) });
  };
  const createPosition = async (input: PositionInput) => {
    try { const created = await window.jobSearch.positions.create(input); await resource.reload(); setEditorOpen(false); navigate(`/positions/${created.id}`); toast.success('岗位记录已保存'); }
    catch { toast.error('岗位记录保存失败，请稍后重试'); throw new Error('position create failed'); }
  };

  return <div className="positions-page">
    <section className="page-heading"><div><p className="section-label">机会台账 / POSITION LEDGER</p><h2>机会台账</h2><p>记录岗位与流程日期。</p></div><button className="button button--primary" onClick={() => setEditorOpen(true)} type="button">录入岗位</button></section>
    <form className="position-filter" onSubmit={applyFilter}><label><span>搜索岗位</span><input aria-label="搜索岗位" maxLength={500} onChange={(e) => setQuery(e.target.value)} value={query} /></label><label><span>流程阶段</span><select aria-label="流程阶段" onChange={(e) => setStage(e.target.value as CanonicalStage | '')} value={stage}><option value="">全部阶段</option>{stageOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label><button className="button button--quiet" type="submit">筛选</button><span className="position-filter__count">{resource.data?.reduce((n, g) => n + g.members.length, 0) ?? 0} 条记录</span></form>
    {resource.loading ? <div className="resource-state" role="status"><span className="resource-state__mark" aria-hidden="true" />正在读取岗位记录…</div> : null}
    {!resource.loading && resource.error ? <EmptyState action={<button className="button button--quiet" onClick={() => void resource.reload()} type="button">重新加载</button>} body="岗位记录暂时无法读取，请稍后重试。" title="岗位读取失败" icon="!" /> : null}
    {!resource.loading && !resource.error && resource.data?.length === 0 ? <EmptyState action={<button className="button button--primary" onClick={() => setEditorOpen(true)} type="button">录入岗位</button>} body="先记录一个感兴趣的岗位，后续流程和复盘都会集中在这里。" title="还没有岗位记录" /> : null}
    {!resource.loading && !resource.error && resource.data?.length ? <div className="position-table-wrap"><table className="position-table"><thead><tr><th>岗位</th><th>兴趣度</th><th>阶段</th><th>更新时间</th><th>结果</th></tr></thead><tbody>{resource.data.flatMap((group) => { const expanded = expandedCompanies.has(group.canonicalName); const fastest = group.members[0]; const latestUpdatedAt = group.members.reduce((latest, member) => member.updatedAt > latest ? member.updatedAt : latest, ''); return [<tr className="position-group-header" key={`${group.canonicalName}-header`}><th colSpan={5}><button className="position-group-toggle" type="button" aria-expanded={expanded} onClick={() => setExpandedCompanies((s) => { const n = new Set(s); n.has(group.canonicalName) ? n.delete(group.canonicalName) : n.add(group.canonicalName); return n; })}><span aria-hidden="true" className="position-group-toggle__chevron">{expanded ? '⌄' : '›'}</span><strong>{group.canonicalName}</strong><span className="position-group-toggle__count">{group.members.length} 条记录</span><span className="position-group-toggle__updated">最近更新 {latestUpdatedAt.slice(0, 10) || '—'}</span><span className="position-group-toggle__stage"><StatusBadge stage={fastest?.currentStage ?? undefined} label={fastest?.currentStage ? undefined : '未设置'} /></span></button></th></tr>, ...(expanded ? group.members.map((position) => <tr key={position.id}><th><Link to={`/positions/${position.id}`}><strong>{position.title}</strong><span className="position-list-location">{position.location || '位置未记录'}</span>{preparationTasks[position.id] ? <small>{preparationTasks[position.id]?.status}</small> : null}</Link></th><td>{position.interest}/5</td><td><StatusBadge stage={position.currentStage ?? undefined} /></td><td>{position.updatedAt.slice(0, 10)}</td><td>{position.finalResult ?? '—'}</td></tr>) : [])]; })}</tbody></table></div> : null}
    <PositionIntakePanel onClose={() => setEditorOpen(false)} onSave={createPosition} open={editorOpen} />
  </div>;
}
