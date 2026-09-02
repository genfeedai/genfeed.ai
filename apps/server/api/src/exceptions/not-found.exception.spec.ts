import { NotFoundException } from '@api/exceptions/not-found.exception';
import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('NotFoundException', () => {
  it('builds a resource-only 404 without a source parameter', () => {
    const error = new NotFoundException('Persona');

    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(error.message).toBe('Persona not found');
    expect(error.getResponse()).toEqual({
      detail: 'Persona not found',
      title: 'Resource Not Found',
    });
  });

  it('includes the identifier in the detail and source parameter', () => {
    const error = new NotFoundException('Batch', 'batch_1');

    expect(error.message).toBe("Batch with identifier 'batch_1' not found");
    expect(error.getResponse()).toEqual({
      detail: "Batch with identifier 'batch_1' not found",
      source: { parameter: 'batch_1' },
      title: 'Resource Not Found',
    });
  });

  it('uses a verbatim message when constructed with options', () => {
    const error = new NotFoundException({
      message: 'That schedule no longer exists.',
    });

    expect(error.message).toBe('That schedule no longer exists.');
    expect(error.getResponse()).toEqual({
      detail: 'That schedule no longer exists.',
      title: 'Resource Not Found',
    });
  });
});
