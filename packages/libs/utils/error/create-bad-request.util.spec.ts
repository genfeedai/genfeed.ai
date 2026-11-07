import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { createBadRequest } from './create-bad-request.util';

describe('createBadRequest', () => {
  it('builds a 400 BadRequestException carrying the message', () => {
    const error = createBadRequest('key must be a single path component');

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getStatus()).toBe(400);
    expect(error.message).toBe('key must be a single path component');
  });
});
