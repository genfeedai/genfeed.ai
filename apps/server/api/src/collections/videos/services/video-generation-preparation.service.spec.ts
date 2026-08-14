import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
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
