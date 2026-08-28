import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  assertSeedanceReferenceVideoDuration,
  createMissingPromptIdException,
  MISSING_PROMPT_ID_DETAIL,
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
