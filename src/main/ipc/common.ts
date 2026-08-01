import { ZodError } from 'zod';
import type { AppError } from '../../shared/ipc';
import { RepositoryError } from '../repositories/common';
import { AiServiceError } from '../services/ai-settings';
import { BackupServiceError } from '../services/backup';

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
    diagnostics: Pick<AppError, 'providerMessage' | 'httpStatus' | 'requestId'> = {},
  ) {
    super(`JOB_SEARCH_ERROR:${JSON.stringify({ code, message, ...diagnostics })}`);
    this.name = 'SafeIpcError';
    this.providerMessage = diagnostics.providerMessage;
    this.httpStatus = diagnostics.httpStatus;
    this.requestId = diagnostics.requestId;
  }

  public readonly providerMessage?: string;
  public readonly httpStatus?: number;
  public readonly requestId?: string;
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
    return new SafeIpcError(error.code, error.message, {
      providerMessage: error.providerMessage,
      httpStatus: error.httpStatus,
      requestId: error.requestId,
    });
  }
  if (error instanceof BackupServiceError) {
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
