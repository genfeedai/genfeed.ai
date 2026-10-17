import { BrandedGenerationFeedbackService } from '@api/services/branded-generation-receipts/branded-generation-feedback.service';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

const actor = { actorId: 'user', brandId: 'brand', organizationId: 'org' };
const GENERATED = 'Generated post text';
const hash = (value: string) => `sha256:${value.padEnd(64, '0')}`;

function artifact(kind = 'post') {
  return {
    contentHash: hash('a'),
    id: 'post-1',
    kind,
    mediaKind: 'text',
    parts: [],
    version: hashBrandedGenerationTextV1(GENERATED),
  };
}

function setup(
  overrides: {
    projection?: unknown;
    post?: unknown;
    discarded?: unknown;
    feedback?: unknown;
    rows?: unknown[];
  } = {},
) {
  const tx = {
    brandedGenerationFeedback: {
      findFirst: vi.fn().mockResolvedValue(overrides.feedback ?? null),
      findMany: vi.fn().mockResolvedValue(overrides.rows ?? []),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    brandedGenerationReceipt: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          'projection' in overrides && overrides.projection === null
            ? null
            : { projection: overrides.projection ?? { artifact: artifact() } },
        ),
    },
    post: {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce(overrides.post ?? null)
        .mockResolvedValueOnce(overrides.discarded ?? null),
    },
  };
  const access = {
    assertBrand: vi.fn().mockResolvedValue({ isOwnerOrAdmin: false }),
  };
  const prisma = {
    $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const service = new BrandedGenerationFeedbackService(
    prisma as unknown as PrismaService,
    access as unknown as BrandedGenerationReceiptAccessService,
  );
  return { access, service, tx };
}

const livePost = (description = GENERATED, reviewDecision: unknown = null) => ({
  description,
  reviewDecision,
  status: 'draft',
});

describe('BrandedGenerationFeedbackService', () => {
  describe('get', () => {
    it('returns no rating when the member has not rated', async () => {
      const { service, access } = setup({ post: livePost() });
      expect(await service.get(actor, 'receipt')).toEqual({
        id: 'receipt',
        implicit: {
          isDiscarded: false,
          isEdited: false,
          postStatus: 'draft',
          reviewDecision: null,
        },
        ratedAt: null,
        rating: null,
        reasons: [],
        receiptId: 'receipt',
      });
      expect(access.assertBrand).toHaveBeenCalledOnce();
    });

    it("returns the member's own rating scoped to the tenant", async () => {
      const updatedAt = new Date('2026-10-17T10:00:00.000Z');
      const { service, tx } = setup({
        feedback: { rating: 'down', reasons: ['off_voice'], updatedAt },
        post: livePost(),
      });
      const result = await service.get(actor, 'receipt');
      expect(result.rating).toBe('down');
      expect(result.reasons).toEqual(['off_voice']);
      expect(result.ratedAt).toBe(updatedAt.toISOString());
      expect(tx.brandedGenerationFeedback.findFirst).toHaveBeenCalledWith({
        where: {
          actorId: 'user',
          brandId: 'brand',
          isDeleted: false,
          organizationId: 'org',
          receiptId: 'receipt',
        },
      });
    });

    it('flags text edited after generation and surfaces the review decision', async () => {
      const { service } = setup({
        post: livePost('Hand edited', 'APPROVED'),
      });
      const { implicit } = await service.get(actor, 'receipt');
      expect(implicit).toMatchObject({
        isEdited: true,
        reviewDecision: 'approved',
      });
    });

    it('reports a deleted post as discarded', async () => {
      const { service } = setup({ discarded: { id: 'post-1' } });
      const { implicit } = await service.get(actor, 'receipt');
      expect(implicit).toEqual({
        isDiscarded: true,
        isEdited: null,
        postStatus: null,
        reviewDecision: null,
      });
    });

    it('has no post signals for a non-post output', async () => {
      const { service, tx } = setup({
        projection: { artifact: artifact('ingredient') },
      });
      const { implicit } = await service.get(actor, 'receipt');
      expect(implicit.isEdited).toBeNull();
      expect(tx.post.findFirst).not.toHaveBeenCalled();
    });

    it('does not find a receipt of another brand or organization', async () => {
      const { service, tx } = setup({ projection: null });
      await expect(service.get(actor, 'receipt')).rejects.toThrow(
        'receipt_not_found',
      );
      expect(tx.brandedGenerationReceipt.findFirst).toHaveBeenCalledWith({
        select: { projection: true },
        where: {
          brandId: 'brand',
          id: 'receipt',
          isDeleted: false,
          organizationId: 'org',
        },
      });
    });
  });

  describe('rate', () => {
    it('upserts one rating per member and receipt', async () => {
      const { service, tx } = setup({ post: livePost() });
      await service.rate(actor, 'receipt', {
        rating: 'down',
        reasons: ['too_long', 'wrong_facts'],
      });
      expect(tx.brandedGenerationFeedback.upsert).toHaveBeenCalledWith({
        create: {
          actorId: 'user',
          brandId: 'brand',
          organizationId: 'org',
          rating: 'down',
          reasons: ['too_long', 'wrong_facts'],
          receiptId: 'receipt',
        },
        update: {
          isDeleted: false,
          rating: 'down',
          reasons: ['too_long', 'wrong_facts'],
        },
        where: {
          organizationId: 'org',
          receiptId_actorId: { actorId: 'user', receiptId: 'receipt' },
        },
      });
    });

    it('refuses an API key', async () => {
      const { service, tx } = setup();
      await expect(
        service.rate({ ...actor, isApiKey: true }, 'receipt', {
          rating: 'up',
          reasons: [],
        }),
      ).rejects.toThrow('feedback_member_required');
      expect(tx.brandedGenerationFeedback.upsert).not.toHaveBeenCalled();
    });

    it('refuses a receipt with no output to rate', async () => {
      const { service, tx } = setup({ projection: { artifact: null } });
      await expect(
        service.rate(actor, 'receipt', { rating: 'up', reasons: [] }),
      ).rejects.toThrow('feedback_receipt_has_no_output');
      expect(tx.brandedGenerationFeedback.upsert).not.toHaveBeenCalled();
    });
  });

  describe('withdraw', () => {
    it('soft-deletes only the caller own rating', async () => {
      const { service, tx } = setup();
      await service.withdraw(actor, 'receipt');
      expect(tx.brandedGenerationFeedback.updateMany).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: {
          actorId: 'user',
          brandId: 'brand',
          isDeleted: false,
          organizationId: 'org',
          receiptId: 'receipt',
        },
      });
    });

    it('refuses an API key', async () => {
      const { service } = setup();
      await expect(
        service.withdraw({ ...actor, isApiKey: true }, 'receipt'),
      ).rejects.toThrow('feedback_member_required');
    });
  });

  describe('summarize', () => {
    it('tallies ratings, reasons and receipt modes', async () => {
      const { service, tx } = setup({
        rows: [
          { rating: 'up', reasons: [], receipt: { mode: 'approved_brand' } },
          { rating: 'up', reasons: [], receipt: { mode: 'approved_brand' } },
          {
            rating: 'down',
            reasons: ['off_voice', 'too_long'],
            receipt: { mode: 'approved_brand' },
          },
          {
            rating: 'down',
            reasons: ['off_voice'],
            receipt: { mode: 'raw' },
          },
        ],
      });
      const summary = await service.summarize(actor);
      expect(summary).toEqual({
        byMode: [
          { down: 1, mode: 'approved_brand', up: 2 },
          { down: 1, mode: 'raw', up: 0 },
        ],
        down: 2,
        id: 'brand',
        reasons: [
          { count: 2, reason: 'off_voice' },
          { count: 0, reason: 'wrong_facts' },
          { count: 1, reason: 'too_long' },
          { count: 0, reason: 'too_generic' },
          { count: 0, reason: 'other' },
        ],
        up: 2,
        windowDays: 30,
      });
      expect(tx.brandedGenerationFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5000,
          where: expect.objectContaining({
            brandId: 'brand',
            isDeleted: false,
            organizationId: 'org',
            updatedAt: { gte: expect.any(Date) },
          }),
        }),
      );
    });
  });
});
