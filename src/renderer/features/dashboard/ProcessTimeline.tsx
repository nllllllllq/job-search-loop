import { Link } from 'react-router-dom';
import type { DashboardSummary } from '../../../shared/domain';

interface ProcessTimelineProps {
  events: DashboardSummary['processEvents'];
}

export function ProcessTimeline({ events }: ProcessTimelineProps) {
  if (events.length === 0) {
    return <p className="dashboard-panel__empty">还没有记录实际或预计流程日期。</p>;
  }
  return (
    <ol className="process-date-line">
      {events.map((event, index) => (
        <li key={`${event.positionId}-${event.stageName}-${event.dateType}-${event.date}-${index}`}>
          <time dateTime={event.date}>{event.date}</time>
          <span className="process-date-line__type" data-date-type={event.dateType}>
            {event.dateType === 'actual' ? '实际日期' : '预计日期'}
          </span>
          <div>
            <Link to={`/positions/${event.positionId}`}>{event.positionLabel}</Link>
            <p>{event.stageName}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
