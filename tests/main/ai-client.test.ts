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
  it('uses Responses Web Search and parses fenced JSON output', async () => {
    const fetch = vi.fn<AiClientDependencies['fetch']>(async () => response({
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: '```json\n{"answer":"researched"}\n```' }],
      }],
    }));
    const client = fixture(fetch, {
      getSettings: vi.fn(async () => ({
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/',
        model: 'Doubao-Seed-2.0-mini',
        apiKey: 'secret-key',
      })),
    });

    await expect(client.completeJsonWithWebSearch(request, outputSchema))
      .resolves.toEqual({ answer: 'researched' });
    expect(fetch).toHaveBeenCalledWith(
      'https://ark.cn-beijing.volces.com/api/v3/responses',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      model: 'Doubao-Seed-2.0-mini',
      input: request.messages,
      tools: [{ type: 'web_search' }],
      store: false,
    });
  });

  it('maps configured image input parts into an OpenAI-compatible request body', async () => {
    const imageBytes = new Uint8Array([1, 2, 3]);
    const fetch = vi.fn<AiClientDependencies['fetch']>(async () => response({
      choices: [{ message: { content: '{"answer":"ok"}' } }],
    }));
    const client = fixture(fetch, {
      getSettings: vi.fn(async () => ({
        baseUrl: 'https://api.example.com/v1',
        model: 'vision-model',
        apiKey: 'secret-key',
        capabilities: {
          images: true,
        },
      })),
    });

    await expect(client.completeJson({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Read these inputs.' },
          { type: 'image', mimeType: 'image/png', bytes: imageBytes },
        ],
      }],
    }, outputSchema)).resolves.toEqual({ answer: 'ok' });

    const payload = JSON.parse(String(fetch.mock.calls[0][1]!.body));
    expect(payload).toEqual({
      model: 'vision-model',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Read these inputs.' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,AQID' },
          },
        ],
      }],
      temperature: 0.2,
    });
    expect(JSON.stringify(fetch.mock.calls[0][0])).not.toContain('AQID');
  });

  it('rejects unsupported image inputs before fetching', async () => {
    const fetch = vi.fn<AiClientDependencies['fetch']>(async () => response({
      choices: [{ message: { content: '{"answer":"ok"}' } }],
    }));
    const client = fixture(fetch);

    const error = await client.completeJson({
      messages: [{
        role: 'user',
        content: [{
          type: 'image',
          mimeType: 'image/png',
          bytes: new Uint8Array([1, 2, 3]),
        }],
      }],
    }, outputSchema).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'AI_INPUT_UNSUPPORTED' });
    expect(JSON.stringify(error)).not.toContain('AQID');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects all file inputs before fetching, even when image input is enabled', async () => {
    const fetch = vi.fn<AiClientDependencies['fetch']>(async () => response({
      choices: [{ message: { content: '{"answer":"ok"}' } }],
    }));
    const client = fixture(fetch, {
      getSettings: vi.fn(async () => ({
        baseUrl: 'https://api.example.com/v1',
        model: 'vision-model',
        apiKey: 'secret-key',
        capabilities: { images: true },
      })),
    });

    await expect(client.completeJson({
      messages: [{
        role: 'user',
        content: [{
          type: 'file',
          name: 'resume.pdf',
          mimeType: 'application/pdf',
          bytes: new Uint8Array([4, 5, 6]),
        }],
      }],
    }, outputSchema)).rejects.toMatchObject({ code: 'AI_INPUT_UNSUPPORTED' });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects image and file inputs outside user messages before fetching', async () => {
    const fetch = vi.fn<AiClientDependencies['fetch']>(async () => response({
      choices: [{ message: { content: '{"answer":"ok"}' } }],
    }));
    const client = fixture(fetch, {
      getSettings: vi.fn(async () => ({
        baseUrl: 'https://api.example.com/v1',
        model: 'vision-model',
        apiKey: 'secret-key',
        capabilities: {
          images: true,
        },
      })),
    });

    await expect(client.completeJson({
      messages: [{
        role: 'system',
        content: [{
          type: 'image',
          mimeType: 'image/png',
          bytes: new Uint8Array([1, 2, 3]),
        }, {
          type: 'file',
          name: 'resume.pdf',
          mimeType: 'application/pdf',
          bytes: new Uint8Array([4, 5, 6]),
        }],
      }],
    }, outputSchema)).rejects.toMatchObject({ code: 'AI_INPUT_UNSUPPORTED' });

    expect(fetch).not.toHaveBeenCalled();
  });

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

  it('strips an outer JSON markdown fence from Chat JSON output', async () => {
    const client = fixture(async () => response({
      choices: [{ message: { content: '```json\n{"answer":"fenced"}\n```' } }],
    }));

    await expect(client.completeJson(request, outputSchema)).resolves.toEqual({
      answer: 'fenced',
    });
  });

  it('exposes bounded, safe diagnostics for provider errors', async () => {
    const client = fixture(async () => new Response(JSON.stringify({
      error: {
        message: 'Vision input is unsupported by this model. Bearer secret-key',
      },
    }), {
      status: 400,
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req_vision_123',
      },
    }));

    const error = await client.completeJson(request, outputSchema).catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({
      code: 'AI_PROVIDER_ERROR',
      providerMessage: 'Vision input is unsupported by this model.',
      httpStatus: 400,
      requestId: 'req_vision_123',
    });
    expect(JSON.stringify(error)).not.toContain('secret-key');
    expect(JSON.stringify(error)).not.toContain('Bearer');
  });

  it.each([
    'The model "example-model" does not exist or you do not have access to it.',
    'You exceeded your current quota. Please check your plan and billing details.',
  ])('preserves ordinary provider diagnostics: %s', async (providerMessage) => {
    const client = fixture(async () => new Response(JSON.stringify({
      error: { message: providerMessage },
    }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(client.completeJson(request, outputSchema)).rejects.toMatchObject({
      code: 'AI_PROVIDER_ERROR',
      providerMessage,
      httpStatus: 400,
    });
  });

  it('redacts OpenAI-style API keys from ordinary provider diagnostics', async () => {
    const apiKey = 'sk-proj-very-secret-provider-key';
    const client = fixture(async () => new Response(JSON.stringify({
      error: { message: `Invalid API key ${apiKey}` },
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));

    const error = await client.completeJson(request, outputSchema).catch(
      (caught: unknown) => caught,
    );
    const serialized = JSON.stringify(error);

    expect(error).toMatchObject({
      code: 'AI_AUTH_FAILED',
      providerMessage: 'Invalid API key [redacted]',
      httpStatus: 401,
    });
    expect(serialized).not.toContain(apiKey);
  });

  it('does not expose provider errors that echo submitted content', async () => {
    const echoedJd = 'Build the confidential hiring platform for Example Corp';
    const echoedAsset = 'data:image/png;base64,very-private-image-content';
    const client = fixture(async () => new Response(JSON.stringify({
      error: {
        message: `Invalid request: {"messages":[{"content":"${echoedJd}"}],"asset":"${echoedAsset}","authorization":"Bearer secret-key"}`,
      },
    }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }));

    const error = await client.completeJson(request, outputSchema).catch(
      (caught: unknown) => caught,
    );
    const serialized = JSON.stringify(error);

    expect(error).toMatchObject({
      code: 'AI_PROVIDER_ERROR',
      httpStatus: 400,
    });
    expect(serialized).not.toContain(echoedJd);
    expect(serialized).not.toContain(echoedAsset);
    expect(serialized).not.toContain('secret-key');
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

  it('tests both Chat JSON and Responses Web Search capabilities', async () => {
    const fetch = vi.fn<AiClientDependencies['fetch']>()
      .mockResolvedValueOnce(response({
        choices: [{ message: { content: '```json\n{"ok":true}\n```' } }],
      }))
      .mockResolvedValueOnce(response({
        output_text: '```json\n{"ok":true}\n```',
      }));
    const client = fixture(fetch);

    await expect(client.testConnection()).resolves.toEqual({
      ok: true,
      message: '连接成功，可以使用。',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    const chatInit = fetch.mock.calls[0][1]!;
    expect(JSON.parse(String(chatInit.body)).messages).toEqual([
      expect.objectContaining({ content: expect.stringContaining('JSON') }),
    ]);
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.example.com/v1/chat/completions');
    expect(fetch.mock.calls[1]?.[0]).toBe('https://api.example.com/v1/responses');
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({
      tools: [{ type: 'web_search' }],
      store: false,
    });
  });

  it('identifies the failed capability without exposing provider details', async () => {
    const fetch = vi.fn<AiClientDependencies['fetch']>()
      .mockResolvedValueOnce(response({
        choices: [{ message: { content: '{"ok":true}' } }],
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: 'Invalid request: {"detail":"provider secret body"}' },
      }), {
        status: 503,
        headers: { 'x-request-id': 'req_web_search' },
      }));
    const client = fixture(fetch);

    const error = await client.testConnection().catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: 'AI_PROVIDER_ERROR',
      httpStatus: 503,
      requestId: 'req_web_search',
    });
    expect(String((error as Error).message)).toContain('Responses Web Search');
    expect(JSON.stringify(error)).not.toContain('provider secret body');
  });
});
