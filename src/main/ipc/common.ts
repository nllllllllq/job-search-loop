import { ZodError } from 'zod';
import type { AppError } from '../../shared/ipc';
import { RepositoryError } from '../repositories/common';
import { AiServiceError } from '../services/ai-settings';

export interface IpcMainRegistrar {
  handle(
    channel: string,
    handler: (event: unknown, payload?: unknown) => unknown | Promise<unknown>,
  ): void;
}

export class SafeIpcError extends Error implements AppError {
  constructor(
    public readonly code: AppError['code'],
    message: string,
  ) {
    super(`JOB_SEARCH_ERROR:${JSON.stringify({ code, message })}`);
    this.name = 'SafeIpcError';
  }
}

function safeError(error: unknown): SafeIpcError {
  if (error instanceof SafeIpcError) return error;
  if (error instanceof ZodError) {
    return new SafeIpcError('VALIDATION_ERROR', 'Invalid request');
  }
  if (error instanceof RepositoryError) {
    return new SafeIpcError(error.code, error.message);
  }
  if (error instanceof AiServiceError) {
    return new SafeIpcError(error.code, error.message);
  }
  return new SafeIpcError('INTERNAL_ERROR', 'The request could not be completed');
}

export function safeIpcHandler(
  handler: (event: unknown, payload?: unknown) => unknown | Promise<unknown>,
): (event: unknown, payload?: unknown) => Promise<unknown> {
  return async (event, payload) => {
    try {
      return await handler(event, payload);
    } catch (error) {
      throw safeError(error);
    }
  };
}
