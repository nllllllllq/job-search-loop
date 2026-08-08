import type { CanonicalStage } from './domain';

const STAGE_PRIORITY: Record<CanonicalStage, number> = {
  offer: 0,
  interview: 1,
  assessment: 2,
  applied: 3,
  interested: 4,
  rejected: 5,
  withdrawn: 5,
};

export function stagePriority(stage: CanonicalStage | null | undefined): number {
  return stage ? STAGE_PRIORITY[stage] : 5;
}
