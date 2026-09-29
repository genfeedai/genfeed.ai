import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { PricingType } from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

describe('ModelCreditQuoteService', () => {
  const modelsService = { findOne: vi.fn() };
  const service = new ModelCreditQuoteService(modelsService as never);

  it('quotes from the database row for the base model key', async () => {
    modelsService.findOne.mockResolvedValue({
      cost: 12,
      pricingType: PricingType.FLAT,
    });

    await expect(service.quoteByKey('heygen/avatar')).resolves.toBe(12);
    expect(modelsService.findOne).toHaveBeenCalledWith({
      key: 'heygen/avatar',
    });
  });

  it('refuses to invent a price for a model with no row', async () => {
    modelsService.findOne.mockResolvedValue(null);

    await expect(service.quoteByKey('heygen/avatar')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
