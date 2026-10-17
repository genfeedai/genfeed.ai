import 'reflect-metadata';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandedGenerationFeedbackController } from '@api/collections/branded-generation-receipts/controllers/branded-generation-feedback.controller';
import type { BrandedGenerationFeedbackService } from '@api/services/branded-generation-receipts/branded-generation-feedback.service';
import type {
  BrandedGenerationFeedbackReadV1,
  BrandedGenerationFeedbackSummaryV1,
} from '@genfeedai/contracts/api-types/contracts/branded-generation-feedback.contract';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

const request = {
  originalUrl: '/brands/brand/generation-receipts/receipt/feedback',
} as Request;
const user = { organizationId: 'org', userId: 'actor' } as AuthenticatedUser;
const read: BrandedGenerationFeedbackReadV1 = {
  id: 'receipt',
  implicit: {
    isDiscarded: false,
    isEdited: false,
    postStatus: 'draft',
    reviewDecision: null,
  },
  ratedAt: '2026-10-17T10:00:00.000Z',
  rating: 'down',
  reasons: ['off_voice'],
  receiptId: 'receipt',
};
const summary: BrandedGenerationFeedbackSummaryV1 = {
  byMode: [{ down: 1, mode: 'raw', up: 2 }],
  down: 1,
  id: 'brand',
  reasons: [
    { count: 1, reason: 'off_voice' },
    { count: 0, reason: 'wrong_facts' },
    { count: 0, reason: 'too_long' },
    { count: 0, reason: 'too_generic' },
    { count: 0, reason: 'other' },
  ],
  up: 2,
  windowDays: 30,
};

function setup() {
  const service = {
    get: vi.fn().mockResolvedValue(read),
    rate: vi.fn().mockResolvedValue(read),
    summarize: vi.fn().mockResolvedValue(summary),
    withdraw: vi.fn().mockResolvedValue(undefined),
  };
  return {
    controller: new BrandedGenerationFeedbackController(
      service as unknown as BrandedGenerationFeedbackService,
    ),
    service,
  };
}

describe('BrandedGenerationFeedbackController', () => {
  it('rates with the caller identity and a validated body', async () => {
    const { controller, service } = setup();
    const body = await controller.rate(request, user, 'brand', 'receipt', {
      rating: 'down',
      reasons: ['off_voice'],
    });
    expect(service.rate).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor',
        brandId: 'brand',
        organizationId: 'org',
      }),
      'receipt',
      { rating: 'down', reasons: ['off_voice'] },
    );
    expect(JSON.stringify(body)).toContain('branded-generation-feedback');
  });

  it.each([
    { rating: 'sideways', reasons: [] },
    { rating: 'down', reasons: ['made_up'] },
    { rating: 'up', reasons: ['off_voice'] },
    { rating: 'down', reasons: ['off_voice', 'off_voice'] },
    { rating: 'up', reasons: [], extra: true },
    null,
  ])('rejects the invalid body %j', async (body) => {
    const { controller, service } = setup();
    await expect(
      controller.rate(request, user, 'brand', 'receipt', body),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.rate).not.toHaveBeenCalled();
  });

  it('reads the own rating and the brand summary', async () => {
    const { controller, service } = setup();
    await controller.get(request, user, 'brand', 'receipt');
    expect(service.get).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'actor', brandId: 'brand' }),
      'receipt',
    );
    const body = await controller.summary(request, user, 'brand');
    expect(JSON.stringify(body)).toContain(
      'branded-generation-feedback-summary',
    );
  });

  it('withdraws the own rating', async () => {
    const { controller, service } = setup();
    await controller.withdraw(user, 'brand', 'receipt');
    expect(service.withdraw).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'actor' }),
      'receipt',
    );
  });

  it('rejects a caller with no organization and a malformed id', async () => {
    const { controller } = setup();
    await expect(
      controller.get(request, {} as AuthenticatedUser, 'brand', 'receipt'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.get(request, user, 'brand', 'bad\u0000id'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
