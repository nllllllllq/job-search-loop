import { z, type ZodType } from 'zod';
import type { AiConnectionResult } from '../../shared/domain';
import { AiServiceError, type PrivateAiSettings } from './ai-settings';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionRequest {
  messages: AiMessage[];
}

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface AiClientDependencies {
  fetch: FetchLike;
  getSettings(): Promise<PrivateAiSettings>;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}

export interface AiClient {
  completeJson<T>(
    request: AiCompletionRequest,
    outputSchema: ZodType<T>,
    settingsOverride?: PrivateAiSettings,
  ): Promise<T>;
  testConnection(): Promise<AiConnectionResult>;
}

const providerResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string(),
    }),
  })).min(1),
});

const connectionOutputSchema = z.object({
  ok: z.literal(true),
});

function providerError(): AiServiceError {
  return new AiServiceError(
    'AI_PROVIDER_ERROR',
    '外部 AI 服务暂时无法完成请求。',
  );
}

export function createAiClient({
  fetch,
  getSettings,
  setTimeout: scheduleTimeout = globalThis.setTimeout,
  clearTimeout: cancelTimeout = globalThis.clearTimeout,
}: AiClientDependencies): AiClient {
  const completeJson = async <T>(
    request: AiCompletionRequest,
    outputSchema: ZodType<T>,
    settingsOverride?: PrivateAiSettings,
  ): Promise<T> => {
    const settings = settingsOverride ?? await getSettings();
    const controller = new AbortController();
    let timedOut = false;
    const timer = scheduleTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60_000);

    try {
      let response: Response;
      try {
        response = await fetch(`${settings.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${settings.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: settings.model,
            messages: request.messages,
            temperature: 0.2,
          }),
          signal: controller.signal,
        });
      } catch {
        if (timedOut || controller.signal.aborted) {
          throw new AiServiceError('AI_TIMEOUT', '请求超时，请稍后重试。');
        }
        throw providerError();
      }

      if (response.status === 401 || response.status === 403) {
        throw new AiServiceError(
          'AI_AUTH_FAILED',
          'API Key 或访问权限无效。',
        );
      }
      if (response.status === 429) {
        throw new AiServiceError(
          'AI_RATE_LIMITED',
          '请求过于频繁，请稍后再试。',
        );
      }
      if (!response.ok) throw providerError();

      let providerPayload: unknown;
      try {
        providerPayload = await response.json();
      } catch {
        if (timedOut || controller.signal.aborted) {
          throw new AiServiceError('AI_TIMEOUT', '请求超时，请稍后重试。');
        }
        throw providerError();
      }
      const parsedProvider = providerResponseSchema.safeParse(providerPayload);
      if (!parsedProvider.success) throw providerError();

      let decoded: unknown;
      try {
        decoded = JSON.parse(parsedProvider.data.choices[0].message.content);
      } catch {
        throw new AiServiceError(
          'AI_INVALID_OUTPUT',
          'AI 返回的内容格式无效。',
        );
      }
      const parsedOutput = outputSchema.safeParse(decoded);
      if (!parsedOutput.success) {
        throw new AiServiceError(
          'AI_INVALID_OUTPUT',
          'AI 返回的内容未通过本地校验。',
        );
      }
      return parsedOutput.data;
    } finally {
      cancelTimeout(timer);
    }
  };

  return {
    completeJson,
    async testConnection() {
      await completeJson(
        {
          messages: [{
            role: 'user',
            content: '仅返回 JSON：{"ok":true}',
          }],
        },
        connectionOutputSchema,
      );
      return { ok: true, message: '连接成功，可以使用。' };
    },
  };
}
