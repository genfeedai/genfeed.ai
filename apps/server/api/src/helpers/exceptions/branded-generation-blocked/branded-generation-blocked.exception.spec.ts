import { BrandedGenerationBlockedException } from '@api/helpers/exceptions/branded-generation-blocked/branded-generation-blocked.exception';
import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('BrandedGenerationBlockedException', () => {
  it('carries the status, stable code and receipt id', () => {
    const exception = new BrandedGenerationBlockedException(
      422,
      'provider_output_empty',
      'receipt-1',
    );
    expect(exception).toBeInstanceOf(HttpException);
    expect(exception.getStatus()).toBe(422);
    expect(exception.getResponse()).toEqual({
      code: 'provider_output_empty',
      detail: 'Branded generation stopped: provider_output_empty',
      title: 'Branded generation stopped',
    });
    expect(exception.reasonCode).toBe('provider_output_empty');
    expect(exception.brandedGenerationReceiptId).toBe('receipt-1');
  });
});
