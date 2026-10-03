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
