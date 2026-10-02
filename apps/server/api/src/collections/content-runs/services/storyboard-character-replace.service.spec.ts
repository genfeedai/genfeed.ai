import { StoryboardCharacterReplaceService } from '@api/collections/content-runs/services/storyboard-character-replace.service';
import type { CharacterOperation } from '@api/collections/content-runs/services/storyboard-character-replace-state';
import { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-config-hash';
import {
  STORYBOARD_CHARACTER_REPLACE_LIMITATIONS,
  STORYBOARD_CHARACTER_REPLACE_MODEL_KEY,
} from '@genfeedai/contracts/api-types/contracts/storyboard-character-replace.contract';
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
      category: id.startsWith('video') ? 'VIDEO' : 'IMAGE',
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
  const credential = vi.fn(async () => 'binding');
  const revalidate = vi.fn();
  const libraryAsset = vi.fn(async () => ({
    sourceAssetId: 'video-1',
    url: 'https://fixture.invalid/video',
  }));
  const mediaUrl = vi.fn((key: string) => `https://fixture.invalid/${key}`);
  const service = new StoryboardCharacterReplaceService(
    { ingredient: { findMany } } as never,
    { read, save } as never,
    { revalidate } as never,
    {
      libraryAsset,
    } as never,
    {
      generateMotionTransfer: generate,
      getCredentialFingerprint: credential,
      getBoundRequestStatus: status,
    } as never,
    { buildUrl: mediaUrl } as never,
  );
  return {
    service,
    credential,
    revalidate,
    libraryAsset,
    mediaUrl,
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

function discoveryOperation(
  overrides: Partial<CharacterOperation> = {},
): CharacterOperation {
  return {
    version: 1,
    operationId: 'f22c0c2f-59fa-41d8-b393-a808f65e0b52',
    intentHash: 'private-hash',
    organizationId: 'org',
    brandId: 'brand',
    runId: 'run',
    shotId: 'shot-1',
    videoAssetId: 'video-1',
    imageAssetIds: ['img-a'],
    prompt: 'private-prompt',
    modelKey: STORYBOARD_CHARACTER_REPLACE_MODEL_KEY,
    sourceVersion: { id: 'video-1', updatedAt: '2026-10-01T00:00:00.000Z' },
    referenceVersions: [{ id: 'img-a', updatedAt: '2026-10-01T00:00:00.000Z' }],
    shotFingerprint: storyboardConfigHash(config().plan.shots[0]),
    sourceFingerprint: storyboardConfigHash(config().sourceSnapshot),
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    credentialFingerprint: 'private-credential',
    leaseToken: 'private-lease',
    leaseUntil: 123,
    body: {
      video_url: 'https://private.invalid/video',
      image_urls: ['https://private.invalid/ref'],
      prompt: '',
      resolution: '720p',
    },
    state: 'reconciling',
    receipts: [],
    ...overrides,
  };
}
function noDiscoverySideEffects(h: ReturnType<typeof harness>) {
  for (const spy of [
    h.save,
    h.generate,
    h.status,
    h.credential,
    h.revalidate,
    h.libraryAsset,
    h.mediaUrl,
  ])
    expect(spy).not.toHaveBeenCalled();
}
describe('database-only character discovery', () => {
  it('discovers unknown IDs after reconstruction with one bounded version query and no writes', async () => {
    const h = harness();
    const journal = Array.from({ length: 128 }, (_, i) =>
      discoveryOperation({
        operationId: `f22c0c2f-59fa-41d8-b393-${String(i).padStart(12, '0')}`,
      }),
    );
    h.set({ ...config(), characterReplacementOperations: journal });
    const before = structuredClone(h.get());
    const result = await h.service.list('org', 'brand', 'run', 'shot-1');
    expect(result.operations).toHaveLength(128);
    expect(
      result.operations.every(
        (op) => op.association === 'current' && !op.requestId,
      ),
    ).toBe(true);
    expect(h.findMany).toHaveBeenCalledTimes(1);
    expect(h.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: 'org',
        brandId: 'brand',
        isDeleted: false,
        scope: 'USER',
        id: { in: ['video-1', 'img-a'] },
        category: { in: ['IMAGE', 'VIDEO'] },
        status: { in: ['UPLOADED', 'GENERATED', 'VALIDATED'] },
      }),
      select: { id: true, category: true, updatedAt: true },
    });
    expect(h.get()).toEqual(before);
    for (const secret of [
      'private-',
      'body',
      'lease',
      'Fingerprint',
      'intentHash',
      'updatedAt',
      'createdAt',
    ])
      expect(JSON.stringify(result)).not.toContain(secret);
    noDiscoverySideEffects(h);
  });
  it('filters every identity, orders durable history and preserves detached legacy evidence', async () => {
    const h = harness();
    const old = discoveryOperation({
      receipts: [{ requestId: 'accepted', status: 'queued' }],
    });
    const recent = discoveryOperation({
      operationId: 'f22c0c2f-59fa-41d8-b393-a808f65e0b53',
      createdAt: '2026-10-02T00:00:00.000Z',
      legacy: true,
    });
    const foreign = ['organizationId', 'brandId', 'runId', 'shotId'].map(
      (key) =>
        discoveryOperation({
          [key]: 'foreign',
          receipts: [
            {
              requestId: 'foreign-output',
              status: 'completed',
              outputUrl: 'https://foreign.invalid/result',
            },
          ],
        }),
    );
    const legacy = {
      shotId: 'shot-1',
      requestId: 'historical',
      modelKey: STORYBOARD_CHARACTER_REPLACE_MODEL_KEY,
      imageAssetIds: ['img-a'],
      videoAssetId: 'video-1',
      prompt: 'Old',
      status: 'ready',
      operationId: 'f22c0c2f-59fa-41d8-b393-a808f65e0b54',
      output: {
        kind: 'provider_url',
        url: 'https://fixture.invalid/temporary',
        retained: false,
      },
      chargedCredits: 0,
      limitations: [...STORYBOARD_CHARACTER_REPLACE_LIMITATIONS],
    };
    h.set({
      ...config(),
      characterReplacementOperations: [old, ...foreign, recent],
      characterReplacements: [
        { ...legacy, requestId: 'accepted' },
        legacy,
        { ...legacy, shotId: 'foreign' },
      ],
    });
    const result = await h.service.list('org', 'brand', 'run', 'shot-1');
    expect(result.operations.map((op) => op.operationId)).toEqual([
      recent.operationId,
      old.operationId,
    ]);
    expect(result.operations[0].association).toBe('detached');
    expect(result.legacyReplacements).toEqual([
      { ...legacy, association: 'detached' },
    ]);
    expect(JSON.stringify(result)).not.toContain('foreign');
    noDiscoverySideEffects(h);
  });
  it('missing shots and empty histories do not query assets', async () => {
    const h = harness();
    expect(await h.service.list('org', 'brand', 'run', 'missing')).toEqual({
      operations: [],
      legacyReplacements: [],
    });
    h.set({
      ...config(),
      plan: { shots: [] },
      characterReplacementOperations: [discoveryOperation()],
    });
    expect(
      (await h.service.list('org', 'brand', 'run', 'shot-1')).operations[0]
        .association,
    ).toBe('detached');
    expect(h.findMany).not.toHaveBeenCalled();
    noDiscoverySideEffects(h);
  });
  it.each(['missing', 'category', 'version', 'ordered'])(
    'detaches %s authority consistently with status',
    async (change) => {
      const h = harness();
      const op = discoveryOperation();
      if (change === 'ordered') {
        op.imageAssetIds = ['img-a', 'img-b'];
        op.referenceVersions = [
          { id: 'img-b', updatedAt: '2026-10-01T00:00:00.000Z' },
          { id: 'img-a', updatedAt: '2026-10-01T00:00:00.000Z' },
        ];
      }
      h.set({ ...config(), characterReplacementOperations: [op] });
      const original = h.findMany.getMockImplementation();
      if (!original) throw new Error('Missing query');
      h.findMany.mockImplementation(async (args) => {
        const rows = await original(args);
        if (change === 'missing' || change === 'category')
          return rows.filter((row) => row.id !== 'img-a');
        if (change === 'version')
          return rows.map((row) => ({
            ...row,
            updatedAt: new Date('2026-10-02T00:00:00Z'),
          }));
        return rows;
      });
      const discovered = (await h.service.list('org', 'brand', 'run', 'shot-1'))
        .operations[0];
      expect(discovered.association).toBe('detached');
      noDiscoverySideEffects(h);
      expect(
        (
          await h.service.getStatus(
            'org',
            'brand',
            'run',
            'shot-1',
            op.operationId,
          )
        ).association,
      ).toBe(discovered.association);
    },
  );
  it('propagates scoped read and asset database failures instead of a fake empty or current receipt', async () => {
    const h = harness();
    h.read.mockRejectedValueOnce(new Error('unauthorized run'));
    await expect(
      h.service.list('foreign', 'brand', 'run', 'shot-1'),
    ).rejects.toThrow('unauthorized run');
    h.set({
      ...config(),
      characterReplacementOperations: [discoveryOperation()],
    });
    h.findMany.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      h.service.list('org', 'brand', 'run', 'shot-1'),
    ).rejects.toThrow('database unavailable');
    noDiscoverySideEffects(h);
  });
  it('deduplicates no more than 1152 asset identities in one query for the full durable cap', async () => {
    const h = harness();
    const journal = Array.from({ length: 128 }, (_, i) => {
      const video = `video-${i}`;
      const images = Array.from({ length: 8 }, (_, j) => `img-${i}-${j}`);
      return discoveryOperation({
        operationId: `f22c0c2f-59fa-41d8-b393-${String(i).padStart(12, '0')}`,
        videoAssetId: video,
        imageAssetIds: images,
        sourceVersion: { id: video, updatedAt: '2026-10-01T00:00:00.000Z' },
        referenceVersions: images.map((id) => ({
          id,
          updatedAt: '2026-10-01T00:00:00.000Z',
        })),
      });
    });
    h.set({ ...config(), characterReplacementOperations: journal });
    expect(
      (await h.service.list('org', 'brand', 'run', 'shot-1')).operations.every(
        (op) => op.association === 'current',
      ),
    ).toBe(true);
    expect(h.findMany).toHaveBeenCalledTimes(1);
    expect(h.findMany.mock.calls[0][0].where.id.in).toHaveLength(1152);
    noDiscoverySideEffects(h);
  });
});
