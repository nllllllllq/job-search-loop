import { CHANNELS } from '../../shared/ipc';
import {
  assetReferenceSchema,
  capabilityMergeSchema,
  capabilitySaveSchema,
  idSchema,
  insightSaveSchema,
  noPayloadSchema,
  projectSaveSchema,
  promptKindSchema,
  promptSaveSchema,
  questionListSchema,
  questionSaveSchema,
} from '../../shared/schemas';
import type { AssetsRepository } from '../repositories/assets';
import type { PromptsRepository } from '../repositories/prompts';
import { safeIpcHandler, type IpcMainRegistrar } from './common';

export function registerAssetHandlers(
  ipcMain: IpcMainRegistrar,
  assets: AssetsRepository,
  prompts: PromptsRepository,
): void {
  ipcMain.handle(CHANNELS.assets.projects.list, safeIpcHandler((_event, payload) => {
    noPayloadSchema.parse(payload);
    return assets.listProjects();
  }));
  ipcMain.handle(CHANNELS.assets.projects.get, safeIpcHandler((_event, payload) => (
    assets.getProject(idSchema.parse(payload))
  )));
  ipcMain.handle(CHANNELS.assets.projects.save, safeIpcHandler((_event, payload) => (
    assets.saveProject(projectSaveSchema.parse(payload))
  )));

  ipcMain.handle(CHANNELS.assets.questions.list, safeIpcHandler((_event, payload) => {
    const parsed = questionListSchema.parse(payload);
    return assets.listQuestions(parsed?.type);
  }));
  ipcMain.handle(CHANNELS.assets.questions.get, safeIpcHandler((_event, payload) => (
    assets.getQuestion(idSchema.parse(payload))
  )));
  ipcMain.handle(CHANNELS.assets.questions.save, safeIpcHandler((_event, payload) => (
    assets.saveQuestion(questionSaveSchema.parse(payload))
  )));

  ipcMain.handle(CHANNELS.assets.capabilities.list, safeIpcHandler((_event, payload) => {
    noPayloadSchema.parse(payload);
    return assets.listCapabilities();
  }));
  ipcMain.handle(CHANNELS.assets.capabilities.get, safeIpcHandler((_event, payload) => (
    assets.getCapability(idSchema.parse(payload))
  )));
  ipcMain.handle(CHANNELS.assets.capabilities.save, safeIpcHandler((_event, payload) => (
    assets.saveCapability(capabilitySaveSchema.parse(payload))
  )));
  ipcMain.handle(CHANNELS.assets.capabilities.merge, safeIpcHandler((_event, payload) => {
    const parsed = capabilityMergeSchema.parse(payload);
    return assets.mergeCapabilities(parsed.sourceId, parsed.targetId);
  }));

  ipcMain.handle(CHANNELS.assets.insights.list, safeIpcHandler((_event, payload) => {
    noPayloadSchema.parse(payload);
    return assets.listInsights();
  }));
  ipcMain.handle(CHANNELS.assets.insights.get, safeIpcHandler((_event, payload) => (
    assets.getInsight(idSchema.parse(payload))
  )));
  ipcMain.handle(CHANNELS.assets.insights.save, safeIpcHandler((_event, payload) => (
    assets.saveInsight(insightSaveSchema.parse(payload))
  )));

  ipcMain.handle(CHANNELS.assets.versions, safeIpcHandler((_event, payload) => {
    const parsed = assetReferenceSchema.parse(payload);
    return assets.listVersions(parsed.type, parsed.id);
  }));
  ipcMain.handle(CHANNELS.assets.prompts.list, safeIpcHandler((_event, payload) => {
    noPayloadSchema.parse(payload);
    return prompts.list();
  }));
  ipcMain.handle(CHANNELS.assets.prompts.get, safeIpcHandler((_event, payload) => (
    prompts.get(promptKindSchema.parse(payload))
  )));
  ipcMain.handle(CHANNELS.assets.prompts.save, safeIpcHandler((_event, payload) => {
    const parsed = promptSaveSchema.parse(payload);
    return prompts.save(parsed.kind, parsed.content);
  }));
}
