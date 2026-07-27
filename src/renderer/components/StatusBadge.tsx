import type { CanonicalStage } from '../../shared/domain';

export type StatusTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger';

interface StatusBadgeProps {
  stage?: CanonicalStage;
  tone?: StatusTone;
  label?: string;
}

const stageLabels: Record<CanonicalStage, string> = {
  interested: '感兴趣',
  applied: '已投递',
  assessment: '测评中',
  interview: '面试中',
  offer: '已录用',
  rejected: '未通过',
  withdrawn: '已撤回',
};

const stageTones: Record<CanonicalStage, StatusTone> = {
  interested: 'neutral',
  applied: 'primary',
  assessment: 'warning',
  interview: 'primary',
  offer: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
};

export function StatusBadge({
  stage,
  tone,
  label,
}: StatusBadgeProps) {
  const resolvedLabel = label ?? (stage ? stageLabels[stage] : '未标记');
  const resolvedTone = tone ?? (stage ? stageTones[stage] : 'neutral');

  return (
    <span className="status-badge" data-tone={resolvedTone}>
      <span className="status-badge__dot" aria-hidden="true" />
      {resolvedLabel}
    </span>
  );
}
