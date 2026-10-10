import {
  assertPreparedSeedanceReferenceUrls,
  assertSeedanceReferenceBinding,
  bindSeedanceVideoReferences,
  measuredSeedanceVideoReference,
  type SeedanceVideoReferenceEvidence,
} from '@api/collections/videos/services/seedance-reference-evidence.util';
import { personasServiceStub } from '@api/shared/testing/personas-service.stub';
import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  assertSeedanceReferenceVideoDuration,
  createMissingPromptIdException,
  MISSING_PROMPT_ID_DETAIL,
  VideoGenerationPreparationService,
} from './video-generation-preparation.service';

describe('createMissingPromptIdException', () => {
  it('returns HTTP 400 with the preserved validation message', () => {
    const error = createMissingPromptIdException();

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.getResponse()).toEqual({
      detail: MISSING_PROMPT_ID_DETAIL,
      title: 'Prompt validation failed',
    });
  });
});

describe('assertSeedanceReferenceVideoDuration', () => {
  it('accepts a 30-second combined reference set', () => {
    expect(() =>
      assertSeedanceReferenceVideoDuration([10, 10, 10]),
    ).not.toThrow();
  });

  it('rejects a combined reference set above 30 seconds', () => {
    let thrown: unknown;
    try {
      assertSeedanceReferenceVideoDuration([10, 10, 10, 3]);
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    const httpError = thrown as HttpException;
    expect(httpError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(httpError.getResponse()).toEqual({
      detail: 'Seedance reference videos may total at most 30 seconds',
      title: 'Invalid video reference duration',
    });
  });
});

describe('video selection transport', () => {
  it('sends explicit selections to central enhancement and stops on its validation error', async () => {
    const error = new Error('Selected skill unavailable');
    const enhance = vi.fn().mockRejectedValue(error);
    const unused = {} as never;
    const createMediaDocuments = vi.fn();
    const service = new VideoGenerationPreparationService(
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      personasServiceStub(),
      unused,
      unused,
      unused,
      { createMediaDocuments } as never,
      unused,
      { enhance } as never,
    );
    await expect(
      service.prepare({
        brand: { id: 'brand-1' },
        createVideoDto: {
          text: 'A coast',
          requestedSkillSlugs: ['cinema'],
          harness: true,
        },
        model: 'video-model',
        referenceIds: [],
        request: {},
        user: { organizationId: 'org-1' },
      } as never),
    ).rejects.toBe(error);
    expect(enhance).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: 'video',
        requestedSkillSlugs: ['cinema'],
        harness: true,
        prompt: 'A coast',
      }),
    );
    expect(createMediaDocuments).not.toHaveBeenCalled();
  });
});

describe('canonical video execution references', () => {
  it('uses the exact persisted object key after a scoped category lookup', async () => {
    const findOne = vi.fn().mockResolvedValue({
      id: 'video-1',
      s3Key: 'ingredients/videos/opaque%2F?#token.mp4',
      metadata: { duration: 7 },
    });
    const getPresignedDownloadUrlForObjectKey = vi
      .fn()
      .mockResolvedValue('https://storage.test/source?Signature=fresh');
    const unused = {} as never;
    const service = new VideoGenerationPreparationService(
      unused,
      unused,
      { isAuthorizedMediaDeliveryEnabled: true } as never,
      { getPresignedDownloadUrlForObjectKey } as never,
      { findOne } as never,
      unused,
      unused,
      unused,
      personasServiceStub(),
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
    );
    await expect(
      service['resolveVideoReference']('video-1', 'org-1', 'first-frame'),
    ).resolves.toEqual({
      duration: 7,
      url: 'https://storage.test/source?Signature=fresh',
    });
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'video-1',
        organizationId: 'org-1',
        isDeleted: false,
      }),
      expect.anything(),
    );
    expect(getPresignedDownloadUrlForObjectKey).toHaveBeenCalledWith(
      'ingredients/videos/opaque%2F?#token.mp4',
    );
    findOne.mockResolvedValue({
      id: 'video-1',
      s3Key: null,
      metadata: { duration: 7 },
    });
    await expect(
      service['resolveVideoReference']('video-1', 'org-1', 'first-frame'),
    ).rejects.toThrow('stored media key');
    expect(getPresignedDownloadUrlForObjectKey).toHaveBeenCalledTimes(1);
  });
});

function nativeReference(
  overrides: Partial<SeedanceVideoReferenceEvidence> = {},
): SeedanceVideoReferenceEvidence {
  return {
    assetId: 'video-1',
    organizationId: 'org-1',
    sourceKey: 'videos/stored.mp4',
    sourceVersion: 'a'.repeat(64),
    duration: 4,
    width: 1280,
    height: 720,
    framesPerSecond: 24,
    sizeBytes: 1_000_000,
    url: 'https://storage.test/signed',
    ...overrides,
  };
}
const nativeEndpoint = 'bytedance/seedance-2.5/reference-to-video';

describe('authorized native Seedance reference evidence', () => {
  it('distinguishes equal-duration asset and source-version swaps', () => {
    const original = bindSeedanceVideoReferences(nativeEndpoint, 'org-1', [
      nativeReference(),
    ]);
    for (const changed of [
      nativeReference({ assetId: 'video-2' }),
      nativeReference({ sourceVersion: 'b'.repeat(64) }),
    ]) {
      const replacement = bindSeedanceVideoReferences(nativeEndpoint, 'org-1', [
        changed,
      ]);
      expect(replacement.inputDuration).toBe(original.inputDuration);
      expect(replacement.referenceEvidenceHash).not.toBe(
        original.referenceEvidenceHash,
      );
      expect(() =>
        assertSeedanceReferenceBinding(original, replacement),
      ).toThrow();
    }
    expect(
      bindSeedanceVideoReferences(nativeEndpoint, 'org-1', [
        nativeReference({ url: 'https://storage.test/new-signature' }),
      ]),
    ).toEqual(original);
  });

  it.each([
    { organizationId: 'foreign-org' },
    { sourceVersion: '' },
    { sourceVersion: 'client-timestamp' },
    { duration: Number.NaN },
    { duration: 1.7 },
    { duration: 30.3 },
    { width: 299 },
    { height: 6001 },
    { width: 300, height: 1000 },
    { framesPerSecond: 23 },
    { framesPerSecond: 61 },
    { sizeBytes: 200_000_001 },
  ])('rejects missing, foreign or out-of-contract evidence %o', (change) => {
    expect(() =>
      bindSeedanceVideoReferences(nativeEndpoint, 'org-1', [
        nativeReference(change),
      ]),
    ).toThrow();
  });

  it('enforces provider-specific reference counts and combined durations', () => {
    expect(() =>
      bindSeedanceVideoReferences(nativeEndpoint, 'org-1', []),
    ).toThrow();
    expect(() =>
      bindSeedanceVideoReferences(nativeEndpoint, 'org-1', [
        nativeReference({ duration: 16 }),
        nativeReference({ duration: 16 }),
      ]),
    ).toThrow();
    expect(() =>
      bindSeedanceVideoReferences(
        nativeEndpoint,
        'org-1',
        Array.from({ length: 11 }, () => nativeReference({ duration: 2 })),
      ),
    ).toThrow();
    const v20 = 'bytedance/seedance-2.0/reference-to-video';
    expect(
      bindSeedanceVideoReferences(
        v20,
        'org-1',
        Array.from({ length: 3 }, () => nativeReference({ duration: 5 })),
      ),
    ).toMatchObject({ inputDuration: 15 });
    expect(() =>
      bindSeedanceVideoReferences(v20, 'org-1', [
        nativeReference({ duration: 1 }),
      ]),
    ).toThrow();
    expect(() =>
      bindSeedanceVideoReferences(v20, 'org-1', [
        nativeReference({ duration: 16 }),
      ]),
    ).toThrow();
    expect(() =>
      bindSeedanceVideoReferences(
        v20,
        'org-1',
        Array.from({ length: 4 }, () => nativeReference({ duration: 3 })),
      ),
    ).toThrow();
    expect(() =>
      bindSeedanceVideoReferences(v20, 'org-1', [
        nativeReference({ sizeBytes: 50_000_000 }),
      ]),
    ).toThrow();
  });

  it('requires the exact ordered URLs of the authorized prepared references', () => {
    const references = [
      nativeReference(),
      nativeReference({
        assetId: 'video-2',
        url: 'https://storage.test/second',
      }),
    ];
    expect(() =>
      assertPreparedSeedanceReferenceUrls(
        references,
        references.map((r) => r.url),
      ),
    ).not.toThrow();
    for (const urls of [
      undefined,
      [],
      ['https://caller.test/arbitrary'],
      references.map((r) => r.url).reverse(),
    ])
      expect(() =>
        assertPreparedSeedanceReferenceUrls(references, urls),
      ).toThrow();
  });

  it('rejects a byte change during measurement and an inconsistent probe', () => {
    const before = { assetHash: 'a'.repeat(64), sizeBytes: 1_000_000 };
    const probe = {
      kind: 'video',
      durationSeconds: 4,
      width: 1280,
      height: 720,
      frameRate: 24,
      sizeBytes: 1_000_000,
      probedAt: '2026-10-10T00:00:00.000Z',
      videoCodec: 'h264',
      audioCodec: null,
      container: 'mp4',
    } as const;
    const measured = {
      assetId: 'video-1',
      organizationId: 'org-1',
      sourceKey: 'videos/stored.mp4',
      url: 'https://storage.test/signed',
      before,
      after: before,
      probe,
    };
    expect(measuredSeedanceVideoReference(measured).sourceVersion).toBe(
      before.assetHash,
    );
    expect(() =>
      measuredSeedanceVideoReference({
        ...measured,
        after: { ...before, assetHash: 'b'.repeat(64) },
      }),
    ).toThrow();
    expect(() =>
      measuredSeedanceVideoReference({
        ...measured,
        probe: { ...probe, sizeBytes: 2_000_000 },
      }),
    ).toThrow();
    expect(() =>
      measuredSeedanceVideoReference({
        ...measured,
        probe: { ...probe, durationSeconds: null },
      }),
    ).toThrow();
  });

  it.each(['deleted', 'changed-key', 'changed-bytes', 'unchanged'])(
    'checks fresh tenant-scoped bytes before dispatch: %s',
    async (change) => {
      const reference = nativeReference();
      const findOne = vi.fn().mockResolvedValue(
        change === 'deleted'
          ? null
          : {
              s3Key:
                change === 'changed-key'
                  ? 'videos/replaced.mp4'
                  : reference.sourceKey,
            },
      );
      const getPresignedDownloadUrlForObjectKey = vi
        .fn()
        .mockResolvedValue(reference.url);
      const fingerprintMedia = vi.fn().mockResolvedValue({
        assetHash:
          change === 'changed-bytes' ? 'b'.repeat(64) : reference.sourceVersion,
        sizeBytes: reference.sizeBytes,
      });
      const unused = {} as never;
      const service = new VideoGenerationPreparationService(
        unused,
        unused,
        unused,
        { getPresignedDownloadUrlForObjectKey, fingerprintMedia } as never,
        { findOne } as never,
        unused,
        unused,
        unused,
        personasServiceStub(),
        unused,
        unused,
        unused,
        unused,
        unused,
        unused,
      );
      const check = service.assertFreshNativeVideoReferences({
        modelEndpoint: nativeEndpoint,
        user: { organizationId: 'org-1' },
        nativeVideoReferences: [reference],
      } as never);
      if (change === 'unchanged') await expect(check).resolves.toBeUndefined();
      else await expect(check).rejects.toThrow();
      expect(findOne).toHaveBeenCalledTimes(1);
      expect(findOne).toHaveBeenCalledWith({
        id: reference.assetId,
        organizationId: 'org-1',
        isDeleted: false,
        category: 'VIDEO',
      });
      if (change === 'deleted' || change === 'changed-key')
        expect(fingerprintMedia).not.toHaveBeenCalled();
      else {
        expect(getPresignedDownloadUrlForObjectKey).toHaveBeenCalledTimes(1);
        expect(getPresignedDownloadUrlForObjectKey).toHaveBeenCalledWith(
          reference.sourceKey,
        );
      }
    },
  );
});
