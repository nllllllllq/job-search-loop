import { CHANNELS } from '../../shared/ipc';
import {
  idSchema,
  interviewInputSchema,
  interviewUpdateRequestSchema,
  proposalAcceptSchema,
  proposalListSchema,
} from '../../shared/schemas';
import type { InterviewsRepository } from '../repositories/interviews';
import type { ProposalsRepository } from '../repositories/proposals';
import { safeIpcHandler, type IpcMainRegistrar } from './common';

export function registerReviewHandlers(
  ipcMain: IpcMainRegistrar,
  interviews: InterviewsRepository,
  proposals: ProposalsRepository,
): void {
  ipcMain.handle(CHANNELS.reviews.interviews.create, safeIpcHandler((_event, payload) => (
    interviews.create(interviewInputSchema.parse(payload))
  )));
  ipcMain.handle(CHANNELS.reviews.interviews.update, safeIpcHandler((_event, payload) => {
    const parsed = interviewUpdateRequestSchema.parse(payload);
    return interviews.update(parsed.id, parsed.input);
  }));
  ipcMain.handle(CHANNELS.reviews.interviews.get, safeIpcHandler((_event, payload) => (
    interviews.get(idSchema.parse(payload))
  )));
  ipcMain.handle(CHANNELS.reviews.interviews.list, safeIpcHandler((_event, payload) => (
    interviews.listByPosition(idSchema.parse(payload))
  )));
  ipcMain.handle(CHANNELS.reviews.proposals.list, safeIpcHandler((_event, payload) => {
    const parsed = proposalListSchema.parse(payload);
    return proposals.list(parsed?.status);
  }));
  ipcMain.handle(CHANNELS.reviews.proposals.accept, safeIpcHandler((_event, payload) => {
    const parsed = proposalAcceptSchema.parse(payload);
    return proposals.accept(parsed.id, parsed.editedPayload);
  }));
  ipcMain.handle(CHANNELS.reviews.proposals.ignore, safeIpcHandler((_event, payload) => (
    proposals.ignore(idSchema.parse(payload))
  )));
}
