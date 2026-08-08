import { z, type ZodType } from 'zod';
import {
  defaultAiModelCapabilities,
  type AiConnectionResult,
  type AiInputPart,
} from '../../shared/domain';
import { AiServiceError, type PrivateAiSettings } from './ai-settings';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AiInputPart[];
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
  completeJsonWithWebSearch<T>(
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

const responsesProviderSchema = z.object({
  output_text: z.string().optional(),
  output: z.array(z.object({
    type: z.string().optional(),
    content: z.array(z.object({
      type: z.string().optional(),
      text: z.string().optional(),
    }).passthrough()).optional(),
  }).passthrough()).optional(),
}).passthrough();

function responseOutputText(payload: unknown): string | null {
  const parsed = responsesProviderSchema.safeParse(payload);
  if (!parsed.success) return null;
  if (parsed.data.output_text?.trim()) return parsed.data.output_text;
  const texts = (parsed.data.output ?? []).flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text as string);
  return texts.at(-1) ?? null;
}

function stripOuterJsonFence(value: string): string {
  const trimmed = value.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match?.[1]?.trim() ?? trimmed;
}

function providerError(): AiServiceError {
  return new AiServiceError(
    'AI_PROVIDER_ERROR',
    '外部 AI 服务暂时无法完成请求。',
  );
}

const MAX_PROVIDER_MESSAGE_LENGTH = 1_000;
const MAX_REQUEST_ID_LENGTH = 200;

interface ProviderDiagnostics {
  providerMessage?: string;
  httpStatus?: number;
  requestId?: string;
}

function redactProviderMessage(value: string): string | undefined {
  const normalized = value
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length === 0 || normalized.length > MAX_PROVIDER_MESSAGE_LENGTH) {
    return undefined;
  }

  const redacted = normalized
    .replace(/\bBearer\s+[^\s,;]+/gi, '')
    .replace(/\b(?:api[_ -]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, '')
    .replace(/\bsk(?:-[A-Za-z0-9_]+)+\b/g, '[redacted]')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (
    /\b(?:messages?|content|prompt|asset|attachments?|input)\b\s*["']?\s*[:=]/i.test(normalized)
    || /\bdata:(?:image|application)\//i.test(normalized)
    || /[{}\[\]]/.test(normalized)
  ) {
    return undefined;
  }

  if (
    /\b(?:vision|image|file)\b/i.test(redacted)
    && /\b(?:unsupported|not supported|not available|not enabled)\b/i.test(redacted)
  ) {
    return 'Vision input is unsupported by this model.';
  }

  return redacted.length > 0 ? redacted : undefined;
}

function providerMessageFromBody(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed !== null && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const nested = record.error;
      if (nested !== null && typeof nested === 'object') {
        const message = (nested as Record<string, unknown>).message;
        if (typeof message === 'string') return redactProviderMessage(message);
      }
      if (typeof record.message === 'string') return redactProviderMessage(record.message);
    }
  } catch {
    // Do not expose an unstructured provider response body.
  }
  return undefined;
}

async function providerDiagnostics(response: Response): Promise<ProviderDiagnostics> {
  let body = '';
  try {
    body = await response.text();
  } catch {
    // Keep the generic error when the provider body cannot be read.
  }
  const requestId = response.headers.get('x-request-id')
    ?? response.headers.get('request-id')
    ?? undefined;
  return {
    providerMessage: body.length > 0 ? providerMessageFromBody(body) : undefined,
    httpStatus: response.status,
    requestId: requestId?.slice(0, MAX_REQUEST_ID_LENGTH),
  };
}

function providerErrorWithDiagnostics(diagnostics: ProviderDiagnostics): AiServiceError {
  return new AiServiceError(
    'AI_PROVIDER_ERROR',
    'External AI service could not complete the request.',
    diagnostics.providerMessage,
    diagnostics.httpStatus,
    diagnostics.requestId,
  );
}

function statusError(
  code: 'AI_AUTH_FAILED' | 'AI_RATE_LIMITED',
  message: string,
  diagnostics: ProviderDiagnostics,
): AiServiceError {
  return new AiServiceError(
    code,
    message,
    diagnostics.providerMessage,
    diagnostics.httpStatus,
    diagnostics.requestId,
  );
}

function unsupportedInput(): AiServiceError {
  return new AiServiceError(
    'AI_INPUT_UNSUPPORTED',
    'The configured AI model does not support this input type.',
  );
}

function asDataUrl(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

function mapInputParts(
  parts: AiInputPart[],
  capabilities: PrivateAiSettings['capabilities'],
): Array<Record<string, unknown>> {
  const configured = capabilities ?? defaultAiModelCapabilities;
  return parts.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    if (part.type === 'image') {
      if (!configured.images) throw unsupportedInput();
      return {
        type: 'image_url',
        image_url: { url: asDataUrl(part.mimeType, part.bytes) },
      };
    }
    throw unsupportedInput();
  });
}

function mapMessages(
  messages: AiMessage[],
  capabilities: PrivateAiSettings['capabilities'],
): Array<{ role: AiMessage['role']; content: string | Array<Record<string, unknown>> }> {
  return messages.map((message) => {
    if (
      typeof message.content !== 'string'
      && message.role !== 'user'
      && message.content.some((part) => part.type !== 'text')
    ) {
      throw unsupportedInput();
    }
    return {
      role: message.role,
      content: typeof message.content === 'string'
        ? message.content
        : mapInputParts(message.content, capabilities),
    };
  });
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
    const messages = mapMessages(request.messages, settings.capabilities);
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
            messages,
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

      if (!response.ok) {
        const diagnostics = await providerDiagnostics(response);
        if (response.status === 401 || response.status === 403) {
          throw statusError(
            'AI_AUTH_FAILED',
            'API key or access permission is invalid.',
            diagnostics,
          );
        }
        if (response.status === 429) {
          throw statusError(
            'AI_RATE_LIMITED',
            'Too many requests. Please try again later.',
            diagnostics,
          );
        }
        throw providerErrorWithDiagnostics(diagnostics);
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

  const completeJsonWithWebSearch = async <T>(
    request: AiCompletionRequest,
    outputSchema: ZodType<T>,
    settingsOverride?: PrivateAiSettings,
  ): Promise<T> => {
    const settings = settingsOverride ?? await getSettings();
    const messages = mapMessages(request.messages, settings.capabilities);
    const controller = new AbortController();
    let timedOut = false;
    const timer = scheduleTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60_000);

    try {
      let response: Response;
      try {
        response = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/responses`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${settings.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: settings.model,
            input: messages,
            tools: [{ type: 'web_search' }],
            store: false,
          }),
          signal: controller.signal,
        });
      } catch {
        if (timedOut || controller.signal.aborted) {
          throw new AiServiceError('AI_TIMEOUT', '请求超时，请稍后重试。');
        }
        throw providerError();
      }

      if (!response.ok) {
        const diagnostics = await providerDiagnostics(response);
        if (response.status === 401 || response.status === 403) {
          throw statusError('AI_AUTH_FAILED', 'API key or access permission is invalid.', diagnostics);
        }
        if (response.status === 429) {
          throw statusError('AI_RATE_LIMITED', 'Too many requests. Please try again later.', diagnostics);
        }
        throw providerErrorWithDiagnostics(diagnostics);
      }

      let providerPayload: unknown;
      try {
        providerPayload = await response.json();
      } catch {
        if (timedOut || controller.signal.aborted) {
          throw new AiServiceError('AI_TIMEOUT', '请求超时，请稍后重试。');
        }
        throw providerError();
      }
      const outputText = responseOutputText(providerPayload);
      if (!outputText) throw providerError();

      let decoded: unknown;
      try {
        decoded = JSON.parse(stripOuterJsonFence(outputText));
      } catch {
        throw new AiServiceError('AI_INVALID_OUTPUT', 'AI 返回的内容格式无效。');
      }
      const parsedOutput = outputSchema.safeParse(decoded);
      if (!parsedOutput.success) {
        throw new AiServiceError('AI_INVALID_OUTPUT', 'AI 返回的内容未通过本地校验。');
      }
      return parsedOutput.data;
    } finally {
      cancelTimeout(timer);
    }
  };

  return {
    completeJson,
    completeJsonWithWebSearch,
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
