import type { DatabaseSync } from 'node:sqlite';
import type { DashboardSummary } from '../../shared/domain';
import { canonicalStageSchema } from '../../shared/schemas';
import { integer, nullableText, row, text } from './common';

export interface DashboardRepository {
  getSummary(): DashboardSummary;
}

export function createDashboardRepository(db: DatabaseSync): DashboardRepository {
  return {
    getSummary() {
      const totalPositions = integer(
        row(db.prepare('SELECT COUNT(*) AS count FROM positions').get(), 'position count').count,
        'count',
      );
      const stageDistribution = db.prepare(`
        SELECT current_stage AS stage, COUNT(*) AS count
        FROM positions WHERE current_stage IS NOT NULL
        GROUP BY current_stage ORDER BY current_stage
      `).all().map((value) => {
        const data = row(value, 'stage distribution');
        return {
          stage: canonicalStageSchema.parse(text(data.stage, 'stage')),
          count: integer(data.count, 'count'),
        };
      });
      const positionsWithInterviews = integer(row(db.prepare(`
        SELECT COUNT(DISTINCT position_id) AS count FROM interviews
      `).get(), 'interview position count').count, 'count');
      const completedReviews = integer(row(db.prepare(`
        SELECT COUNT(*) AS count FROM interviews WHERE summary IS NOT NULL AND trim(summary) <> ''
      `).get(), 'completed review count').count, 'count');
      const pendingProposals = integer(row(db.prepare(`
        SELECT COUNT(*) AS count FROM change_proposals WHERE status = 'pending'
      `).get(), 'pending proposal count').count, 'count');
      const processEvents = db.prepare(`
        SELECT s.position_id, p.company, p.title, s.name, s.canonical_stage,
               s.actual_date, s.expected_date
        FROM process_stages s JOIN positions p ON p.id = s.position_id
        WHERE s.actual_date IS NOT NULL OR s.expected_date IS NOT NULL
        ORDER BY COALESCE(s.actual_date, s.expected_date), s.order_index
      `).all().flatMap((value) => {
        const data = row(value, 'process event');
        const common = {
          positionId: text(data.position_id, 'position_id'),
          positionLabel: `${text(data.company, 'company')} · ${text(data.title, 'title')}`,
          stageName: text(data.name, 'name'),
          canonicalStage: canonicalStageSchema.parse(
            text(data.canonical_stage, 'canonical_stage'),
          ),
        };
        const actualDate = nullableText(data.actual_date, 'actual_date');
        const expectedDate = nullableText(data.expected_date, 'expected_date');
        const events: DashboardSummary['processEvents'] = [];
        if (actualDate !== null) events.push({ ...common, date: actualDate, dateType: 'actual' });
        if (expectedDate !== null) events.push({ ...common, date: expectedDate, dateType: 'expected' });
        return events;
      });
      const capabilityFrequency = db.prepare(`
        SELECT c.id, c.name, c.jd_frequency,
          (SELECT COUNT(*) FROM capability_evidence e WHERE e.capability_id = c.id) AS evidence_count
        FROM capabilities c ORDER BY c.jd_frequency DESC, c.name
      `).all().map((value) => {
        const data = row(value, 'capability frequency');
        return {
          capabilityId: text(data.id, 'id'),
          name: text(data.name, 'name'),
          jdFrequency: integer(data.jd_frequency, 'jd_frequency'),
          evidenceCount: integer(data.evidence_count, 'evidence_count'),
        };
      });
      return {
        totalPositions,
        stageDistribution,
        positionsWithInterviews,
        completedReviews,
        pendingProposals,
        processEvents,
        capabilityFrequency,
      };
    },
  };
}
