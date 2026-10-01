import { StoryboardCharacterReplaceService } from '@api/collections/content-runs/services/storyboard-character-replace.service';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const config = () => ({
  revision: 4,
  plan: { shots: [{ id: 'shot-1', title: 'Walk' }] },
  sourceSnapshot: { selector: { kind: 'uploaded_video', assetId: 'video-1' } },
});
function harness() {
  let stored: object = config();
  const findMany = vi.fn(async (args: { where: { id: { in: string[] } } }) =>
    args.where.id.in.map((id) => ({
      id,
      updatedAt: new Date('2026-10-01T00:00:00Z'),
      s3Key: `${id}.jpg`,
    })),
  );
  const read = vi.fn(async () => ({ config: structuredClone(stored) }));
  const save = vi.fn(
    async (
      _org: string,
      _brand: string,
      _run: string,
      previous: object,
      next: object,
    ) => {
      if (JSON.stringify(previous) !== JSON.stringify(stored))
        throw new ConflictException();
      stored = structuredClone(next);
      return {} as never;
    },
  );
  const generate = vi.fn(
    async (params: { onProviderSubmissionStarted?: () => void }) => {
      params.onProviderSubmissionStarted?.();
      return { requestId: 'real-1', status: 'queued' as const };
    },
  );
  const status = vi.fn(async () => ({
    request_id: 'real-1',
    status: 'queued' as const,
  }));
  const service = new StoryboardCharacterReplaceService(
    { ingredient: { findMany } } as never,
    { read, save } as never,
    { revalidate: vi.fn() } as never,
    {
      libraryAsset: vi.fn(async () => ({
        sourceAssetId: 'video-1',
        url: 'https://fixture.invalid/video',
      })),
    } as never,
    {
      generateMotionTransfer: generate,
      getCredentialFingerprint: vi.fn(async () => 'binding'),
      getBoundRequestStatus: status,
    } as never,
    { buildUrl: (key: string) => `https://fixture.invalid/${key}` } as never,
  );
  return {
    service,
    findMany,
    read,
    save,
    generate,
    status,
    get: () => stored,
    set: (value: object) => {
      stored = value;
    },
  };
}
const replace = (
  h: ReturnType<typeof harness>,
  body: object = { imageAssetIds: ['img-a'] },
) => h.service.replace('org', 'brand', 'run', 'shot-1', body);
describe('durable character replacement', () => {
  it('commits immutable identity before HTTP and deduplicates concurrent callers', async () => {
    const h = harness();
    let release: () => void = () => undefined;
    const barrier = new Promise<void>((r) => {
      release = r;
    });
    h.generate.mockImplementationOnce(async (p) => {
      expect(h.get()).toHaveProperty('characterReplacementOperations');
      p.onProviderSubmissionStarted?.();
      await barrier;
      return { requestId: 'real-1', status: 'queued' };
    });
    const first = replace(h);
    await vi.waitFor(() => expect(h.generate).toHaveBeenCalledTimes(1));
    await expect(replace(h)).rejects.toBeInstanceOf(ConflictException);
    release();
    expect((await first).requestId).toBe('real-1');
    expect(h.generate).toHaveBeenCalledTimes(1);
  });
  it('normalizes duplicate refs and submits stable key with committed body', async () => {
    const h = harness();
    const result = await replace(h, { imageAssetIds: ['img-a', 'img-a'] });
    expect(result.imageAssetIds).toEqual(['img-a']);
    expect(h.generate.mock.calls[0]?.[0]).toMatchObject({
      idempotencyKey: result.operationId,
      expectedCredentialFingerprint: 'binding',
      prompt: '',
    });
    await replace(h);
    expect(h.generate).toHaveBeenCalledTimes(1);
  });
  it('keeps editor changes and an accepted handle', async () => {
    const h = harness();
    h.generate.mockImplementationOnce(async (p) => {
      p.onProviderSubmissionStarted?.();
      h.set({ ...h.get(), revision: 5 });
      return { requestId: 'real-1', status: 'queued' };
    });
    await replace(h);
    expect(h.get()).toMatchObject({
      revision: 5,
      characterReplacementOperations: [{ receipts: [{ requestId: 'real-1' }] }],
    });
  });
  it('recovers a lost acknowledgement with exact body/key after lease expiry', async () => {
    const h = harness();
    h.generate.mockImplementationOnce(async (p) => {
      p.onProviderSubmissionStarted?.();
      throw new Error('socket');
    });
    await expect(replace(h)).rejects.toBeInstanceOf(ConflictException);
    const stored = h.get() as {
      characterReplacementOperations: { leaseUntil: number }[];
    };
    stored.characterReplacementOperations[0].leaseUntil = 0;
    h.set(stored);
    await replace(h);
    expect(h.generate.mock.calls[1]?.[0]).toMatchObject({
      idempotencyKey: (
        h.generate.mock.calls[0]?.[0] as { idempotencyKey?: string }
      )?.idempotencyKey,
    });
  });
  it('never succeeds with a missing request id', async () => {
    const h = harness();
    h.generate.mockResolvedValueOnce({ requestId: '', status: 'queued' });
    await expect(replace(h)).rejects.toMatchObject({
      response: expect.objectContaining({
        operationId: expect.any(String),
        errorCode: 'CHARACTER_REPLACEMENT_RECEIPT_UNKNOWN',
      }),
    });
  });
  it('imports legacy without polling or resubmitting after a source edit', async () => {
    const h = harness();
    h.set({
      ...config(),
      characterReplacements: [
        {
          shotId: 'shot-1',
          imageAssetIds: ['img-a'],
          videoAssetId: 'historical-video',
          requestId: 'historical',
          status: 'ready',
        },
      ],
    });
    const result = await replace(h);
    expect(result).toMatchObject({
      requestId: 'historical',
      videoAssetId: 'historical-video',
      status: 'blocked',
    });
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.status).not.toHaveBeenCalled();
  });
  it('scopes status and never submits through GET', async () => {
    const h = harness();
    const result = await replace(h);
    await expect(
      h.service.getStatus(
        'org',
        'brand',
        'run',
        'foreign',
        result.operationId ?? 'missing',
      ),
    ).rejects.toThrow();
    expect(h.status).not.toHaveBeenCalled();
    await h.service.getStatus(
      'org',
      'brand',
      'run',
      'shot-1',
      result.operationId ?? 'missing',
    );
    expect(h.generate).toHaveBeenCalledTimes(1);
  });
  it('status rejects mismatched identities without appending an invented handle', async () => {
    const h = harness(),
      result = await replace(h);
    h.status.mockResolvedValueOnce({
      request_id: 'different',
      status: 'queued',
    });
    const status = await h.service.getStatus(
      'org',
      'brand',
      'run',
      'shot-1',
      result.operationId ?? 'missing',
    );
    expect(status.acceptedRequestIds).toEqual(['real-1']);
    expect(status.status).toBe('reconciling');
    expect(status.errorCode).toBe(
      'CHARACTER_REPLACEMENT_STATUS_IDENTITY_MISMATCH',
    );
  });
  it('a definite-beforeHTTP blocked retry revalidates after claiming', async () => {
    const h = harness();
    h.generate.mockRejectedValueOnce(new Error('before HTTP'));
    await expect(replace(h)).rejects.toThrow();
    const save = h.save.getMockImplementation();
    if (!save) throw new Error('Missing save');
    h.save.mockImplementationOnce(async (...args) => {
      const result = await save(...args);
      const value = h.get() as { plan: { shots: object[] } };
      h.set({ ...value, plan: { shots: [] } });
      return result;
    });
    await expect(replace(h)).rejects.toThrow();
    expect(h.generate).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, 123, 'undocumented'])(
    'persists known ID with malformed acceptance status %s and never resubmits',
    async (status) => {
      const h = harness();
      h.generate.mockResolvedValueOnce({
        requestId: 'accepted',
        status,
      } as never);
      const result = await replace(h);
      expect(result).toMatchObject({
        requestId: 'accepted',
        status: 'reconciling',
      });
      const stored = h.get() as {
        characterReplacementOperations: {
          receipts: { requestId: string; status: string }[];
          errorCode: string;
        }[];
      };
      expect(stored.characterReplacementOperations[0]).toMatchObject({
        receipts: [{ requestId: 'accepted', status: 'unknown' }],
        errorCode: 'CHARACTER_REPLACEMENT_PROVIDER_STATUS_UNKNOWN',
      });
      h.status.mockResolvedValueOnce({
        request_id: 'accepted',
        status: 'queued',
      });
      await replace(h);
      expect(h.generate).toHaveBeenCalledTimes(1);
    },
  );
});
