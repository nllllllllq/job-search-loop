import type { AiTask, AiTaskSafeError, PreparationGenerateInput } from '../../shared/domain';
import { preparationGenerateSchema } from '../../shared/schemas';
import type { AiTasksRepository } from '../repositories/ai-tasks';
import type { PreparationService } from './preparation';
import { AiServiceError } from './ai-settings';

export interface PreparationTaskRuntimeDependencies {
  tasks: AiTasksRepository;
  preparation: Pick<PreparationService, 'generate'>;
  schedule?: (job: () => void) => void;
}

export interface PreparationTaskRuntime {
  start(input: PreparationGenerateInput): AiTask;
  get(id: string): AiTask;
  listByPosition(positionId: string): AiTask[];
  drainForTest(): Promise<void>;
}

function safeError(error: unknown): AiTaskSafeError {
  if (error instanceof AiServiceError) {
    return {
      // The repository performs the final allowlist-style sanitation before
      // persistence. Keep a provider diagnostic only when the AI client has
      // already extracted one; arbitrary Error messages are never persisted.
      message: error.providerMessage ?? (error.code === 'AI_PROVIDER_ERROR'
        ? 'The AI provider could not complete this request.'
        : 'Preparation generation could not be completed.'),
      statusCode: error.httpStatus ?? null,
      requestId: error.requestId ?? null,
    };
  }
  return { message: 'Preparation generation could not be completed.', statusCode: null, requestId: null };
}

export function createPreparationTaskRuntime({
  tasks,
  preparation,
  schedule = queueMicrotask,
}: PreparationTaskRuntimeDependencies): PreparationTaskRuntime {
  const pending = new Set<Promise<void>>();

  const run = async (task: AiTask, input: PreparationGenerateInput): Promise<void> => {
    try {
      tasks.markRunning(task.id);
      await preparation.generate(input);
      tasks.markSucceeded(task.id);
    } catch (error) {
      tasks.markFailed(task.id, safeError(error));
    }
  };

  return {
    start(input) {
      const parsed = preparationGenerateSchema.parse(input);
      const task = tasks.createPreparation(parsed.positionId);
      schedule(() => {
        const execution = run(task, parsed).finally(() => pending.delete(execution));
        pending.add(execution);
      });
      return task;
    },
    get(id) { return tasks.get(id); },
    listByPosition(positionId) { return tasks.listByPosition(positionId); },
    async drainForTest() {
      await Promise.resolve();
      await Promise.all([...pending]);
    },
  };
}
