// @vitest-environment node

import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import {
  createAiClient,
  type AiClientDependencies,
} from '../../src/main/services/ai-client';

const outputSchema = z.object({ answer: z.string() });
const request = {
  messages: [
    { role: 'system' as const, content: 'Return JSON.' },
    { role: 'user' as const, content: 'Hello' },
  ],
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fixture(
  fetch: AiClientDependencies['fetch'],
  overrides: Partial<AiClientDependencies> = {},
) {
  return createAiClient({
    fetch,
    getSettings: vi.fn(async () => ({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      apiKey: 'secret-key',
    })),
    ...overrides,
  });
}

describe('OpenAI-compatible AI client', () => {
  it('posts the configured model, messages and fixed temperature', async () => {
    const fetch = vi.fn<AiClientDependencies['fetch']>(async () => response({
      choices: [{ message: { content: '{"answer":"ok"}' } }],
    }));
    const client = fixture(fetch);

    await expect(client.completeJson(request, outputSchema)).resolves.toEqual({
      answer: 'ok',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer secret-key',
          'Content-Type': 'application/json',
        },
      }),
    );
    const init = fetch.mock.calls[0][1]!;
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'model-a',
      messages: request.messages,
      temperature: 0.2,
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps invalid JSON and schema-invalid JSON to AI_INVALID_OUTPUT', async () => {
    const invalidJson = fixture(async () => response({
      choices: [{ message: { content: 'not-json' } }],
    }));
    await expect(invalidJson.completeJson(request, outputSchema))
      .rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });

    const invalidShape = fixture(async () => response({
      choices: [{ message: { content: '{"answer":42}' } }],
    }));
    await expect(invalidShape.completeJson(request, outputSchema))
      .rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
  });

  it.each([
    [401, 'AI_AUTH_FAILED'],
    [403, 'AI_AUTH_FAILED'],
    [429, 'AI_RATE_LIMITED'],
    [500, 'AI_PROVIDER_ERROR'],
  ] as const)('maps HTTP %s to %s without returning response content', async (status, code) => {
    const client = fixture(async () => new Response(
      'provider-body-with-secret',
      { status },
    ));
    const error = await client.completeJson(request, outputSchema).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ code });
    expect(String((error as Error).message)).not.toContain('provider-body-with-secret');
  });

  it('maps network failures and missing choices to AI_PROVIDER_ERROR', async () => {
    const network = fixture(async () => {
      throw new Error('socket exposed detail');
    });
    const networkError = await network.completeJson(request, outputSchema).catch(
      (caught: unknown) => caught,
    );
    expect(networkError).toMatchObject({ code: 'AI_PROVIDER_ERROR' });
    expect(String((networkError as Error).message)).not.toContain('socket exposed detail');

    const missingChoices = fixture(async () => response({ choices: [] }));
    await expect(missingChoices.completeJson(request, outputSchema))
      .rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' });
  });

  it('aborts after 60 seconds and always clears the timeout', async () => {
    vi.useFakeTimers();
    const clearTimeout = vi.fn(globalThis.clearTimeout);
    const fetch = vi.fn<AiClientDependencies['fetch']>(
      (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }),
    );
    const client = fixture(fetch, { clearTimeout });
    const pending = client.completeJson(request, outputSchema);
    const timeoutAssertion = expect(pending).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
    });

    await vi.advanceTimersByTimeAsync(60_000);
    await timeoutAssertion;
    expect(clearTimeout).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('maps a timeout while reading the provider response to AI_TIMEOUT', async () => {
    vi.useFakeTimers();
    const client = fixture(async (_url, init) => new Response(
      new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () => {
            controller.error(new DOMException('Aborted', 'AbortError'));
          });
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    const pending = client.completeJson(request, outputSchema);
    const timeoutAssertion = expect(pending).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
    });

    await vi.advanceTimersByTimeAsync(60_000);
    await timeoutAssertion;
    vi.useRealTimers();
  });

  it('clears the timeout after success and provider failure', async () => {
    const clearTimeout = vi.fn(globalThis.clearTimeout);
    await fixture(
      async () => response({ choices: [{ message: { content: '{"answer":"ok"}' } }] }),
      { clearTimeout },
    ).completeJson(request, outputSchema);
    expect(clearTimeout).toHaveBeenCalledOnce();

    clearTimeout.mockClear();
    await expect(fixture(
      async () => response({}, 500),
      { clearTimeout },
    ).completeJson(request, outputSchema)).rejects.toMatchObject({
      code: 'AI_PROVIDER_ERROR',
    });
    expect(clearTimeout).toHaveBeenCalledOnce();
  });

  it('uses a minimal structured request when testing the connection', async () => {
    const fetch = vi.fn<AiClientDependencies['fetch']>(async () => response({
      choices: [{ message: { content: '{"ok":true}' } }],
    }));
    const client = fixture(fetch);

    await expect(client.testConnection()).resolves.toEqual({
      ok: true,
      message: '连接成功，可以使用。',
    });
    const init = fetch.mock.calls[0][1]!;
    expect(JSON.parse(String(init.body)).messages).toEqual([
      expect.objectContaining({ content: expect.stringContaining('JSON') }),
    ]);
  });
});
