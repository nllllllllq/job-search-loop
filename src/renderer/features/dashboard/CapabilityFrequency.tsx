import type { DashboardSummary } from '../../../shared/domain';

interface CapabilityFrequencyProps {
  items: DashboardSummary['capabilityFrequency'];
}

export function CapabilityFrequency({ items }: CapabilityFrequencyProps) {
  if (items.length === 0) {
    return <p className="dashboard-panel__empty">已确认的能力主题会在这里形成频次视图。</p>;
  }
  const maximum = Math.max(1, ...items.map((item) => item.jdFrequency));
  return (
    <ul className="capability-frequency" aria-label="能力频次">
      {items.map((item) => (
        <li key={item.capabilityId}>
          <div>
            <strong>{item.name}</strong>
            <span>{item.jdFrequency} 份 JD · {item.evidenceCount} 条证据</span>
          </div>
          <div className="capability-frequency__track" aria-hidden="true">
            <span style={{ width: `${Math.round((item.jdFrequency / maximum) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
