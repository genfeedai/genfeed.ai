import { ContextEmbeddingProviderService } from '@api/collections/contexts/services/context-embedding-provider.service';
import type { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import type { RouterService } from '@api/services/router/router.service';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('axios');

function fixture() {
  const embedding = Array.from({ length: 1024 }, () => 0.25);
  const openRouter = {
    embeddings: vi.fn().mockResolvedValue({ data: [{ embedding }] }),
  };
  const router = {
    getDefaultModel: vi.fn().mockResolvedValue('existing-model'),
  };
  const service = new ContextEmbeddingProviderService(
    router as unknown as RouterService,
    openRouter as unknown as OpenRouterService,
  );
  return { service, router, openRouter, embedding };
}
describe('stored and query embedding provider boundaries', () => {
  it('resolves the existing selected model without making a provider request', async () => {
    const f = fixture();
    await expect(f.service.selectModel()).resolves.toBe('existing-model');
    expect(f.openRouter.embeddings).not.toHaveBeenCalled();
  });
  it('preserves query transport defaults', async () => {
    const f = fixture();
    await expect(f.service.query('query')).resolves.toBe(f.embedding);
    expect(f.openRouter.embeddings).toHaveBeenCalledExactlyOnceWith({
      input: 'query',
      model: 'existing-model',
    });
  });
  it('bounds a stored request with both cancellation and a 60-second timeout', async () => {
    const f = fixture();
    await expect(f.service.stored('stored', 'pinned-model')).resolves.toBe(
      f.embedding,
    );
    expect(f.router.getDefaultModel).not.toHaveBeenCalled();
    expect(f.openRouter.embeddings).toHaveBeenCalledExactlyOnceWith(
      { input: 'stored', model: 'pinned-model' },
      undefined,
      { signal: expect.any(AbortSignal), timeout: 60_000 },
    );
  });
  it.each([
    [],
    [1],
    Array.from({ length: 1024 }, () => Number.NaN),
    Array.from({ length: 1024 }, () => Number.POSITIVE_INFINITY),
  ])(
    'rejects invalid vectors without retrying the transport',
    async (embedding) => {
      const f = fixture();
      f.openRouter.embeddings.mockResolvedValue({ data: [{ embedding }] });
      await expect(
        f.service.stored('private input', 'pinned-model'),
      ).rejects.toMatchObject({
        safeFailureCode: 'INVALID_VECTOR',
        isRetryable: false,
      });
      expect(f.openRouter.embeddings).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    [undefined, 'NETWORK', true],
    [408, 'TIMEOUT', true],
    [429, 'RATE_LIMITED', true],
    [500, 'PROVIDER_UNAVAILABLE', true],
    [503, 'PROVIDER_UNAVAILABLE', true],
    [401, 'PROVIDER_AUTH', false],
    [403, 'PROVIDER_AUTH', false],
    [400, 'PROVIDER_REJECTED', false],
  ])(
    'classifies transport status %s without retaining provider payloads',
    async (status, safeFailureCode, isRetryable) => {
      const f = fixture();
      f.openRouter.embeddings.mockRejectedValue({
        isAxiosError: true,
        message: 'private provider body',
        ...(status === undefined
          ? {}
          : { response: { status, data: 'private payload' } }),
      });
      await expect(
        f.service.stored('private input', 'pinned-model'),
      ).rejects.toMatchObject({
        message: safeFailureCode,
        safeFailureCode,
        isRetryable,
      });
      expect(f.openRouter.embeddings).toHaveBeenCalledTimes(1);
    },
  );
});
