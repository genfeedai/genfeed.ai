import { ValidationException } from '@api/exceptions/validation.exception';
import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('ValidationException', () => {
  it('returns a 422 without a source when no field is provided', () => {
    const error = new ValidationException('Name is required');

    expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(error.getResponse()).toEqual({
      detail: 'Name is required',
      title: 'Validation Error',
    });
  });

  it('points at the field and includes the rejected value when present', () => {
    const error = new ValidationException('Too short', 'slug', 'ab');

    expect(error.getResponse()).toEqual({
      detail: 'Too short',
      source: {
        parameter: 'ab',
        pointer: '/data/attributes/slug',
      },
      title: 'Validation Error',
    });
  });
});
