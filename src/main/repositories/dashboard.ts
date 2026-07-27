import type { DatabaseSync } from 'node:sqlite';
import type { DashboardSummary } from '../../shared/domain';
import { canonicalStageSchema } from '../../shared/schemas';
import { integer, row, text } from './common';

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
        SELECT COUNT(DISTINCT position_id) AS count
        FROM process_stages
        WHERE canonical_stage = 'interview' AND actual_date IS NOT NULL
      `).get(), 'interview position count').count, 'count');
      const completedReviews = integer(row(db.prepare(`
        SELECT COUNT(*) AS count FROM interviews WHERE summary IS NOT NULL AND trim(summary) <> ''
      `).get(), 'completed review count').count, 'count');
      const pendingProposals = integer(row(db.prepare(`
        SELECT COUNT(*) AS count FROM change_proposals WHERE status = 'pending'
      `).get(), 'pending proposal count').count, 'count');
      const processEvents = db.prepare(`
        SELECT s.position_id, p.company, p.title, s.name, s.canonical_stage,
               s.id AS stage_id, s.order_index, s.actual_date AS event_date,
               'actual' AS date_type, 0 AS date_type_order
        FROM process_stages s
        JOIN positions p ON p.id = s.position_id
        WHERE s.actual_date IS NOT NULL
        UNION ALL
        SELECT s.position_id, p.company, p.title, s.name, s.canonical_stage,
               s.id AS stage_id, s.order_index, s.expected_date AS event_date,
               'expected' AS date_type, 1 AS date_type_order
        FROM process_stages s
        JOIN positions p ON p.id = s.position_id
        WHERE s.expected_date IS NOT NULL
        ORDER BY event_date, date_type_order, order_index, stage_id
      `).all().map((value): DashboardSummary['processEvents'][number] => {
        const data = row(value, 'process event');
        const dateType = text(data.date_type, 'date_type');
        if (dateType !== 'actual' && dateType !== 'expected') {
          throw new Error('Invalid database field: date_type');
        }
        return {
          positionId: text(data.position_id, 'position_id'),
          positionLabel: `${text(data.company, 'company')} · ${text(data.title, 'title')}`,
          stageName: text(data.name, 'name'),
          canonicalStage: canonicalStageSchema.parse(
            text(data.canonical_stage, 'canonical_stage'),
          ),
          date: text(data.event_date, 'event_date'),
          dateType,
        };
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
      const recentPositions = db.prepare(`
        SELECT id, company, title, interest, current_stage, final_result, updated_at
        FROM positions
        ORDER BY updated_at DESC, created_at DESC, id DESC
        LIMIT 8
      `).all().map((value) => {
        const data = row(value, 'recent position');
        const interest = integer(data.interest, 'interest');
        const currentStage = data.current_stage === null
          ? null
          : canonicalStageSchema.parse(text(data.current_stage, 'current_stage'));
        return {
          id: text(data.id, 'id'),
          company: text(data.company, 'company'),
          title: text(data.title, 'title'),
          interest: interest as 1 | 2 | 3 | 4 | 5,
          currentStage,
          finalResult: data.final_result === null
            ? null
            : text(data.final_result, 'final_result'),
          updatedAt: text(data.updated_at, 'updated_at'),
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
        recentPositions,
      };
    },
  };
}
