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

export type StageDatePolicy =
  | { kind: 'single'; actualLabel: string; autoToday: boolean }
  | { kind: 'notice-and-event'; expectedLabel: '收到通知时间'; actualLabel: string };

export function stageDatePolicy(stage: CanonicalStage): StageDatePolicy {
  if (stage === 'assessment') {
    return { kind: 'notice-and-event', expectedLabel: '收到通知时间', actualLabel: '测评进行时间' };
  }
  if (stage === 'interview') {
    return { kind: 'notice-and-event', expectedLabel: '收到通知时间', actualLabel: '面试进行时间' };
  }
  if (stage === 'applied') {
    return { kind: 'single', actualLabel: '投递时间', autoToday: true };
  }
  if (stage === 'interested') {
    return { kind: 'single', actualLabel: '记录时间', autoToday: true };
  }
  if (stage === 'offer') {
    return { kind: 'single', actualLabel: '收到 Offer 时间', autoToday: false };
  }
  return { kind: 'single', actualLabel: '记录时间', autoToday: false };
}
