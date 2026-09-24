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
