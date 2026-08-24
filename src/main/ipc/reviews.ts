import { CHANNELS } from '../../shared/ipc';
import {
  idSchema,
  interviewListSchema,
  interviewInputSchema,
  interviewReviewPreviewSchema,
  interviewReviewPreviewInputSchema,
  interviewReviewResultSchema,
  interviewSchema,
  interviewUpdateRequestSchema,
  changeProposalListSchema,
  changeProposalSchema,
  proposalAcceptSchema,
  proposalListSchema,
} from '../../shared/schemas';
import type { InterviewsRepository } from '../repositories/interviews';
import type { ProposalsRepository } from '../repositories/proposals';
import type { InterviewReviewService } from '../services/interview-review';
import { safeIpcHandler, type IpcMainRegistrar } from './common';

export function registerReviewHandlers(
  ipcMain: IpcMainRegistrar,
  interviews: Pick<
    InterviewsRepository,
    'create' | 'update' | 'get' | 'listByPosition' | 'saveSummary'
  >,
  proposals: ProposalsRepository,
  review?: InterviewReviewService,
): void {
  ipcMain.handle(CHANNELS.reviews.interviews.create, safeIpcHandler((_event, payload) => (
    interviewSchema.parse(interviews.create(interviewInputSchema.parse(payload)))
  )));
  ipcMain.handle(CHANNELS.reviews.interviews.update, safeIpcHandler((_event, payload) => {
    const parsed = interviewUpdateRequestSchema.parse(payload);
    return interviewSchema.parse(interviews.update(parsed.id, parsed.input));
  }));
  ipcMain.handle(CHANNELS.reviews.interviews.get, safeIpcHandler((_event, payload) => (
    interviewSchema.parse(interviews.get(idSchema.parse(payload)))
  )));
  ipcMain.handle(CHANNELS.reviews.interviews.list, safeIpcHandler((_event, payload) => (
    interviewListSchema.parse(interviews.listByPosition(idSchema.parse(payload)))
  )));
  if (review) {
    ipcMain.handle(CHANNELS.reviews.review.preview, safeIpcHandler(async (_event, payload) => (
      interviewReviewPreviewSchema.parse(
        await review.preview(interviewReviewPreviewInputSchema.parse(payload)),
      )
    )));
    ipcMain.handle(CHANNELS.reviews.review.confirm, safeIpcHandler(async (_event, payload) => (
      interviewReviewResultSchema.parse(
        await review.confirm(idSchema.parse(payload)),
      )
    )));
    ipcMain.handle(CHANNELS.reviews.review.cancelPreview, safeIpcHandler(async (_event, payload) => {
      await review.cancelPreview(idSchema.parse(payload));
    }));
  }
  ipcMain.handle(CHANNELS.reviews.proposals.list, safeIpcHandler((_event, payload) => {
    const parsed = proposalListSchema.parse(payload);
    return changeProposalListSchema.parse(proposals.list(parsed?.status));
  }));
  ipcMain.handle(CHANNELS.reviews.proposals.accept, safeIpcHandler((_event, payload) => {
    const parsed = proposalAcceptSchema.parse(payload);
    return changeProposalSchema.parse(proposals.accept(parsed.id, parsed.editedPayload));
  }));
  ipcMain.handle(CHANNELS.reviews.proposals.ignore, safeIpcHandler((_event, payload) => (
    changeProposalSchema.parse(proposals.ignore(idSchema.parse(payload)))
  )));
}
