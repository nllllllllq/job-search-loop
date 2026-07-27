import type { DashboardSummary } from '../../../shared/domain';
import { StatusBadge } from '../../components/StatusBadge';

interface StageDistributionProps {
  items: DashboardSummary['stageDistribution'];
  total: number;
}

export function StageDistribution({ items, total }: StageDistributionProps) {
  if (items.length === 0) {
    return <p className="dashboard-panel__empty">还没有可统计的岗位阶段。</p>;
  }
  return (
    <ul className="stage-distribution" aria-label="当前阶段分布">
      {items.map((item) => {
        const percentage = total === 0 ? 0 : Math.round((item.count / total) * 100);
        return (
          <li key={item.stage}>
            <div className="stage-distribution__label">
              <StatusBadge stage={item.stage} />
              <strong>{item.count}</strong>
            </div>
            <div aria-label={`${percentage}%`} className="stage-distribution__track" role="img">
              <span style={{ width: `${percentage}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
