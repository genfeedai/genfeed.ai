import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

const hash = `sha256:${'a'.repeat(64)}`;
const time = '2026-10-01T00:00:00.000Z';
function receipt(): BrandedGenerationReceiptV1 {
  return {
    schemaVersion: 1,
    id: 'receipt',
    organizationId: 'org',
    brandId: 'brand',
    actorId: 'PRIVATE_ACTOR',
    requestKey: 'PRIVATE_REQUEST',
    candidateIndex: 0,
    requestHash: hash,
    revision: 0,
    state: 'created',
    mode: 'raw',
    surface: 'api',
    contentType: 'post',
    format: 'text',
    createdAt: time,
    updatedAt: time,
    snapshot: null,
    resolutionHash: null,
    layers: [],
    learning: null,
    prompts: {
      original: { contentHash: hash, retention: 'pending' },
      enhanced: null,
      compiled: null,
    },
    execution: null,
    artifact: null,
    validation: null,
    compliance: 'not_claimed',
    diagnostics: [],
    costs: [{ id: 'cost', stage: 'generation', status: 'pending' }],
    budget: {
      version: 'brand-enforcement-v1',
      maximumGenerationAttempts: 1,
      automaticPaidRetries: 0,
      generationAttemptsUsed: 0,
    },
    isDeleted: false,
  };
}
function publicReceipt() {
  const { actorId: _actor, requestKey: _key, ...value } = receipt();
  return {
    ...value,
    platform: null,
    parentRequestId: null,
    runId: null,
    workflowExecutionId: null,
    generationId: null,
  };
}

import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { BrandedGenerationReceiptsService } from '@services/ai/branded-generation-receipts.service';
import { describe, expect, it } from 'vitest';

function setup() {
  const service = new BrandedGenerationReceiptsService('test-token');
  return { service, http: installMockHttp(service) };
}
function page(
  items: ReturnType<typeof publicReceipt>[],
  nextCursor: string | null = null,
) {
  return {
    ...collectionDocument(items, { type: 'branded-generation-receipt' }),
    links: { cursor: { hasMore: nextCursor !== null, limit: 10, nextCursor } },
  };
}
describe('receipt read HTTP client', () => {
  it('uses only five encoded GET routes, exact revision/query/signals and normalized public bodies', async () => {
    const { service, http } = setup();
    const signal = new AbortController().signal;
    const value = { ...publicReceipt(), id: 'receipt /?', brandId: 'brand /?' };
    http.get.mockResolvedValueOnce(axiosResponse(page([value], 'opaque')));
    expect(
      (
        await service.list(
          value.brandId,
          { limit: 10, cursor: 'before' },
          signal,
        )
      ).nextCursor,
    ).toBe('opaque');
    http.get.mockResolvedValueOnce(
      axiosResponse(
        resourceDocument(value, {
          id: value.id,
          type: 'branded-generation-receipt',
        }),
      ),
    );
    expect(await service.get(value.brandId, value.id, signal)).toEqual(value);
    const revision = {
      ...value,
      id: `${value.id}:2`,
      receiptId: value.id,
      revision: 2,
    };
    http.get.mockResolvedValueOnce(
      axiosResponse({
        ...collectionDocument([revision], {
          type: 'branded-generation-receipt-revision',
        }),
        links: { cursor: { hasMore: true, limit: 10, nextCursor: '2' } },
      }),
    );
    expect(
      (
        await service.history(
          value.brandId,
          value.id,
          { limit: 10, afterRevision: 1 },
          signal,
        )
      ).nextAfterRevision,
    ).toBe(2);
    http.get.mockResolvedValueOnce(
      axiosResponse(
        resourceDocument(revision, {
          id: revision.id,
          type: 'branded-generation-receipt-revision',
        }),
      ),
    );
    expect(
      await service.getRevision(value.brandId, value.id, 2, signal),
    ).toEqual(revision);
    const prompt = {
      id: `${value.id}:2:compiled`,
      receiptId: value.id,
      receiptRevision: 2,
      stage: 'compiled',
      status: 'retained',
      text: '  🎨\r\n',
      contentHash: hash,
      reasonCode: null,
    };
    http.get.mockResolvedValueOnce(
      axiosResponse(
        resourceDocument(prompt, {
          id: prompt.id,
          type: 'branded-generation-prompt-inspection',
        }),
      ),
    );
    expect(
      await service.readPrompt(value.brandId, value.id, 2, 'compiled', signal),
    ).toEqual(prompt);
    const path = 'brand%20%2F%3F/generation-receipts';
    expect(http.get.mock.calls).toEqual([
      [path, { params: { limit: 10, cursor: 'before' }, signal }],
      [`${path}/receipt%20%2F%3F`, { signal }],
      [
        `${path}/receipt%20%2F%3F/history`,
        { params: { limit: 10, afterRevision: 1 }, signal },
      ],
      [`${path}/receipt%20%2F%3F/revisions/2`, { signal }],
      [
        `${path}/receipt%20%2F%3F/prompts/compiled`,
        { params: { revision: 2 }, signal },
      ],
    ]);
    for (const method of ['post', 'patch', 'put', 'delete'] as const)
      expect(http[method]).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    { hasMore: true, limit: 10, nextCursor: null },
    { hasMore: false, limit: 10, nextCursor: 'cursor' },
    { hasMore: false, limit: 11, nextCursor: null },
    { hasMore: true, limit: 10, nextCursor: '' },
  ])('rejects missing/inconsistent cursor links', async (cursor) => {
    const { service, http } = setup();
    http.get.mockResolvedValue(
      axiosResponse({ ...page([publicReceipt()]), links: { cursor } }),
    );
    await expect(service.list('brand')).rejects.toThrow(
      'receipt_response_invalid',
    );
  });
  it.each(['01', '-1', '2147483648', '1.0', '1e2'])(
    'rejects noncanonical history cursor %s',
    async (nextCursor) => {
      const { service, http } = setup();
      http.get.mockResolvedValue(
        axiosResponse({
          ...collectionDocument([], {
            type: 'branded-generation-receipt-revision',
          }),
          links: { cursor: { hasMore: true, limit: 10, nextCursor } },
        }),
      );
      await expect(service.history('brand', 'receipt')).rejects.toThrow(
        'receipt_response_invalid',
      );
    },
  );
  it('rejects wrong type/resource/brand/revision/stage and private attributes', async () => {
    const { service, http } = setup();
    for (const patch of [
      { brandId: 'other' },
      { actorId: 'private' },
      { id: 'other' },
    ]) {
      const value = { ...publicReceipt(), ...patch };
      http.get.mockResolvedValueOnce(
        axiosResponse(
          resourceDocument(value, {
            id: value.id,
            type: 'branded-generation-receipt',
          }),
        ),
      );
      await expect(service.get('brand', 'receipt')).rejects.toThrow(
        'receipt_response_invalid',
      );
    }
    http.get.mockResolvedValueOnce(
      axiosResponse(
        resourceDocument(publicReceipt(), { id: 'receipt', type: 'wrong' }),
      ),
    );
    await expect(service.get('brand', 'receipt')).rejects.toThrow(
      'receipt_response_invalid',
    );
    const revision = {
      ...publicReceipt(),
      receiptId: 'receipt',
      id: 'receipt:1',
      revision: 1,
    };
    http.get.mockResolvedValueOnce(
      axiosResponse(
        resourceDocument(revision, {
          id: revision.id,
          type: 'branded-generation-receipt-revision',
        }),
      ),
    );
    await expect(service.getRevision('brand', 'receipt', 0)).rejects.toThrow(
      'receipt_response_invalid',
    );
    const prompt = {
      id: 'receipt:0:original',
      receiptId: 'receipt',
      receiptRevision: 0,
      stage: 'original',
      status: 'unavailable',
      text: null,
      contentHash: null,
      reasonCode: 'prompt_payload_purged',
    };
    http.get.mockResolvedValueOnce(
      axiosResponse(
        resourceDocument(prompt, {
          id: prompt.id,
          type: 'branded-generation-prompt-inspection',
        }),
      ),
    );
    await expect(
      service.readPrompt('brand', 'receipt', 0, 'compiled'),
    ).rejects.toThrow('receipt_response_invalid');
  });
  it('preserves HTTP forbidden errors for safe hook mapping', async () => {
    const { service, http } = setup();
    const error = { isAxiosError: true, response: { status: 403 } };
    http.get.mockRejectedValue(error);
    await expect(
      service.readPrompt('brand', 'receipt', 0, 'original'),
    ).rejects.toBe(error);
  });
});
