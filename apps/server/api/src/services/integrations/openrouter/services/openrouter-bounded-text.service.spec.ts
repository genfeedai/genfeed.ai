import { openrouterTextContractFixture } from '@api/collections/models/utils/openrouter-text-contract.fixture';
import { prepareOpenRouterTextLine as prepare } from '@api/helpers/utils/credits/openrouter-text-quote.util';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import type { OpenRouterChatCompletionResponse } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { OpenRouterBoundedTextService } from '@api/services/integrations/openrouter/services/openrouter-bounded-text.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

const messages = [{ role: 'user' as const, content: 'A synthetic brief' }];
function fixture(byok = false) {
  const prepared = prepare({
    contract: openrouterTextContractFixture(
      byok
        ? { kind: 'unavailable', version: 1, reason: 'synthetic missing rate' }
        : undefined,
    ),
    messages,
    maximumOutputTokens: 100,
    route: byok
      ? { kind: 'byok', credentialId: 'key-1' }
      : { kind: 'platform' },
  });
  const response: OpenRouterChatCompletionResponse = {
    id: 'synthetic-response',
    model: 'synthetic/text-model',
    choices: [
      {
        message: { role: 'assistant', content: '{"shots":[]}' },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
      cost: 0.0001,
      cost_source: 'usage',
    },
  };
  const chatCompletion = vi
    .fn()
    .mockResolvedValue({ response, generationMetadata: null });
  const service = new OpenRouterBoundedTextService({
    chatCompletionWithEvidence: chatCompletion,
  } as unknown as OpenRouterService);
  return { prepared, response, chatCompletion, service };
}
describe('one pinned bounded text completion', () => {
  it('pins endpoint, ceiling, price controls and retention, and returns full response with authoritative evidence', async () => {
    const f = fixture();
    const result = await f.service.dispatchPreparedText({
      prepared: f.prepared,
      messages,
    });
    expect(f.chatCompletion).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        model: 'synthetic/text-model',
        messages,
        max_tokens: 100,
        stream: false,
        provider: {
          order: ['synthetic-provider/region-variant'],
          only: ['synthetic-provider/region-variant'],
          allow_fallbacks: false,
          require_parameters: true,
          data_collection: 'deny',
          zdr: true,
          max_price: { prompt: 1, completion: 2, request: 0.0001 },
        },
        plugins: [{ id: 'context-compression', enabled: false }],
        reasoning: { enabled: false },
      }),
      undefined,
    );
    expect(result).toMatchObject({
      status: 'observed',
      response: f.response,
      evidence: { accountCostUsd: 0.0001, promptTokens: 10 },
    });
  });
  it('requires exact request and credential identity before dispatch without platform fallback', async () => {
    const f = fixture(true);
    await expect(
      f.service.dispatchPreparedText({ prepared: f.prepared, messages }),
    ).rejects.toThrow();
    await expect(
      f.service.dispatchPreparedText({
        prepared: f.prepared,
        messages,
        credential: { credentialId: 'key-2', apiKey: 'synthetic-key' },
      }),
    ).rejects.toThrow();
    await expect(
      f.service.dispatchPreparedText({
        prepared: f.prepared,
        messages: [{ ...messages[0], content: 'changed' }],
        credential: { credentialId: 'key-1', apiKey: 'synthetic-key' },
      }),
    ).rejects.toThrow();
    expect(f.chatCompletion).not.toHaveBeenCalled();
  });
  it('preserves unknown BYOK vendor/account cost as null without a tariff or price ceilings', async () => {
    const f = fixture(true);
    delete f.response.usage.cost;
    delete f.response.usage.cost_source;
    const result = await f.service.dispatchPreparedText({
      prepared: f.prepared,
      messages,
      credential: { credentialId: 'key-1', apiKey: 'synthetic-key' },
    });
    expect(result).toMatchObject({
      status: 'observed',
      evidence: { accountCostUsd: null, upstreamInferenceCostUsd: null },
    });
    expect(f.chatCompletion.mock.calls[0][0].provider).not.toHaveProperty(
      'max_price',
    );
  });
  it.each([
    'model',
    'cost',
    'overflow',
    'missing-usage',
    'multiple-choices',
  ] as const)(
    'retains received response as uncertain for %s, without a retry or token-cost fallback',
    async (change) => {
      const f = fixture();
      if (change === 'model') f.response.model = 'another/model';
      if (change === 'cost') delete f.response.usage.cost;
      if (change === 'overflow') f.response.usage.completion_tokens = 101;
      if (change === 'missing-usage')
        f.chatCompletion.mockResolvedValue({
          response: { ...f.response, usage: {} },
          generationMetadata: null,
        });
      if (change === 'multiple-choices')
        f.response.choices.push(f.response.choices[0]);
      const result = await f.service.dispatchPreparedText({
        prepared: f.prepared,
        messages,
      });
      expect(result.status).toBe('uncertain');
      expect(result.response).toBeDefined();
      expect(f.chatCompletion).toHaveBeenCalledTimes(1);
    },
  );
});

describe('bounded adapter with actual HTTP transport', () => {
  function actualTransport(response: unknown, generationMetadata: unknown) {
    const post = vi.fn().mockReturnValue(of({ data: response }));
    const get = vi
      .fn()
      .mockReturnValue(of({ data: { data: generationMetadata } }));
    const service = new OpenRouterBoundedTextService(
      new OpenRouterService(
        {
          get: vi.fn().mockReturnValue('synthetic-key'),
        } as unknown as ConfigService,
        { error: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
        { post, get } as unknown as HttpService,
      ),
    );
    return { service, post, get };
  }
  it.each([
    'body-model',
    'metadata-model',
    'metadata-id',
    'missing-metadata-model',
  ] as const)(
    'preserves both bodies and rejects conflicting or missing identity: %s',
    async (change) => {
      const f = fixture();
      delete f.response.usage.cost;
      delete f.response.usage.cost_source;
      const metadata: Record<string, unknown> = {
        id: f.response.id,
        model: f.response.model,
        total_cost: 0.0001,
        is_byok: false,
      };
      if (change === 'body-model') f.response.model = 'conflicting/body-model';
      if (change === 'metadata-model')
        metadata.model = 'conflicting/metadata-model';
      if (change === 'metadata-id') metadata.id = 'another-generation';
      if (change === 'missing-metadata-model') delete metadata.model;
      const before = structuredClone(f.response);
      const actual = actualTransport(f.response, metadata);
      const result = await actual.service.dispatchPreparedText({
        prepared: f.prepared,
        messages,
      });
      expect(result.status).toBe('uncertain');
      expect(result.response).toEqual(before);
      expect(result.generationMetadata).toBe(metadata);
      expect(actual.post).toHaveBeenCalledTimes(1);
      expect(actual.get).toHaveBeenCalledTimes(1);
      expect(actual.get.mock.calls[0][1].params).toEqual({ id: before.id });
    },
  );
  it('hashes raw completion and matching generation metadata separately without mutation', async () => {
    const f = fixture();
    delete f.response.usage.cost;
    delete f.response.usage.cost_source;
    const metadata = {
      id: f.response.id,
      model: f.response.model,
      total_cost: 0.0001,
      is_byok: false,
    };
    const before = structuredClone(f.response);
    const actual = actualTransport(f.response, metadata);
    const result = await actual.service.dispatchPreparedText({
      prepared: f.prepared,
      messages,
    });
    expect(result).toMatchObject({
      status: 'observed',
      response: before,
      generationMetadata: metadata,
      evidence: {
        responseHash: quoteSnapshotHash(before),
        generationMetadataHash: quoteSnapshotHash(metadata),
        accountCostUsd: 0.0001,
        costSource: 'generation',
      },
    });
    expect(f.response).toEqual(before);
    expect(actual.post).toHaveBeenCalledTimes(1);
  });
  it('retains raw body as uncertain when the lookup is unavailable, without resubmission', async () => {
    const f = fixture();
    delete f.response.usage.cost;
    const actual = actualTransport(f.response, null);
    actual.get.mockReturnValue(
      throwError(() => new Error('synthetic lookup unavailable')),
    );
    const result = await actual.service.dispatchPreparedText({
      prepared: f.prepared,
      messages,
    });
    expect(result).toMatchObject({
      status: 'uncertain',
      response: f.response,
      generationMetadata: null,
    });
    expect(actual.post).toHaveBeenCalledTimes(1);
  });
  it('uses native response cost without enriching or replacing the raw model', async () => {
    const f = fixture();
    delete f.response.usage.cost_source;
    const actual = actualTransport(f.response, { model: 'other/model' });
    const result = await actual.service.dispatchPreparedText({
      prepared: f.prepared,
      messages,
    });
    expect(result).toMatchObject({
      status: 'observed',
      response: f.response,
      generationMetadata: null,
      evidence: { costSource: 'usage' },
    });
    expect(actual.post).toHaveBeenCalledTimes(1);
    expect(actual.get).not.toHaveBeenCalled();
  });
});

describe('malformed HTTP completion body retention', () => {
  it.each([null, false, 7, 'invalid', [], { id: 'invalid-shape' }])(
    'returns uncertain for malformed body %# without throwing or resubmission',
    async (response) => {
      const f = fixture();
      const post = vi.fn().mockReturnValue(of({ data: response }));
      const get = vi.fn().mockReturnValue(of({ data: { data: null } }));
      const service = new OpenRouterBoundedTextService(
        new OpenRouterService(
          {
            get: vi.fn().mockReturnValue('synthetic-key'),
          } as unknown as ConfigService,
          { error: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
          { post, get } as unknown as HttpService,
        ),
      );
      const result = await service.dispatchPreparedText({
        prepared: f.prepared,
        messages,
      });
      expect(result).toMatchObject({
        status: 'uncertain',
        response,
        reason: 'text_response_shape_invalid',
      });
      expect(post).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledTimes(
        response !== null && typeof response === 'object' && 'id' in response
          ? 1
          : 0,
      );
    },
  );
});
