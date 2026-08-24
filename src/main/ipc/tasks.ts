import { CHANNELS } from '../../shared/ipc';
import {
  aiTaskListSchema,
  aiTaskSchema,
  idSchema,
  preparationGenerateSchema,
} from '../../shared/schemas';
import type { PreparationTaskRuntime } from '../services/preparation-tasks';
import { safeIpcHandler, type IpcMainRegistrar } from './common';

export function registerPreparationTaskHandlers(
  ipcMain: IpcMainRegistrar,
  tasks: Pick<PreparationTaskRuntime, 'start' | 'get' | 'listByPosition'>,
): void {
  ipcMain.handle(CHANNELS.preparations.start, safeIpcHandler((_event, payload) => (
    aiTaskSchema.parse(tasks.start(preparationGenerateSchema.parse(payload)))
  )));
  ipcMain.handle(CHANNELS.tasks.listByPosition, safeIpcHandler((_event, payload) => (
    aiTaskListSchema.parse(tasks.listByPosition(idSchema.parse(payload)))
  )));
  ipcMain.handle(CHANNELS.tasks.get, safeIpcHandler((_event, payload) => (
    aiTaskSchema.parse(tasks.get(idSchema.parse(payload)))
  )));
}
