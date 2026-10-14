import type { LowCreditThresholdService } from '@api/services/low-credit-threshold/low-credit-threshold.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';
import type { FreeTrialEmailsService } from './free-trial-emails.service';
import { LifecycleEmailWorkService } from './lifecycle-email-work.service';

// A Monday, so the last completed week started 2026-09-07 - 7 days earlier.
const NOW = new Date('2026-09-14T08:00:00.000Z');
const HOUR_AGO = new Date('2026-09-14T07:00:00.000Z');
const TWO_HOURS_AGO = new Date('2026-09-14T06:00:00.000Z');

type Overrides = {
  checkpoints?: Array<{ organizationId: string; scannedThrough: Date }>;
  creditBalances?: Array<{
    organizationId: string;
    balance: number;
    heldAmount: number;
  }>;
  due?: Array<{ id: string; userId: string; metadata: unknown }>;
  generations?: Array<{ organizationId: string; at: Date }>;
  memberships?: Array<{ organizationId: string; userId: string }>;
  messages?: string[];
  payingOrganizations?: string[];
  purchases?: Array<{ organizationId: string; at: Date }>;
  recapArticles?: string[];
  recapIngredients?: string[];
  threshold?: number | null;
  trialOrganizations?: string[];
};

function fixture(overrides: Overrides = {}) {
  const prisma = {
    lifecycleEmailDelivery: {
      findMany: vi.fn().mockResolvedValue(overrides.due ?? []),
    },
    member: {
      findMany: vi.fn().mockResolvedValue(overrides.memberships ?? []),
    },
    ingredient: {
      groupBy: vi.fn(({ _max }: { _max?: unknown }) =>
        Promise.resolve(
          _max
            ? (overrides.generations ?? []).map((row) => ({
                organizationId: row.organizationId,
                _max: { generationCompletedAt: row.at },
              }))
            : (overrides.recapIngredients ?? []).map((organizationId) => ({
                organizationId,
              })),
        ),
      ),
    },
    article: {
      groupBy: vi.fn().mockResolvedValue(
        (overrides.recapArticles ?? []).map((organizationId) => ({
          organizationId,
        })),
      ),
    },
    creditTransaction: {
      groupBy: vi.fn().mockResolvedValue(
        (overrides.purchases ?? []).map((row) => ({
          organizationId: row.organizationId,
          _max: { createdAt: row.at },
        })),
      ),
    },
    emailMessage: {
      groupBy: vi.fn().mockResolvedValue(
        (overrides.messages ?? []).map((organizationId) => ({
          organizationId,
        })),
      ),
    },
    emailSignalCheckpoint: {
      findMany: vi.fn().mockResolvedValue(overrides.checkpoints ?? []),
    },
    organization: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          (overrides.payingOrganizations ?? []).map((id) => ({ id })),
        ),
    },
    creditBalance: {
      findMany: vi.fn().mockResolvedValue(overrides.creditBalances ?? []),
    },
  };
  const findNoticeWindowOrganizationIds = vi
    .fn()
    .mockResolvedValue(overrides.trialOrganizations ?? []);
  const resolve = vi.fn().mockResolvedValue({
    isTrialSubject: false,
    threshold: overrides.threshold === undefined ? 500 : overrides.threshold,
  });
  const service = new LifecycleEmailWorkService(
    prisma as unknown as PrismaService,
    { findNoticeWindowOrganizationIds } as unknown as FreeTrialEmailsService,
    { resolve } as unknown as LowCreditThresholdService,
  );
  return { findNoticeWindowOrganizationIds, prisma, resolve, service };
}

describe('LifecycleEmailWorkService', () => {
  it('finds no organization when nothing is due', async () => {
    const { service } = fixture();
    await expect(service.findOrganizationIds(NOW)).resolves.toEqual([]);
  });

  describe('due lifecycle deliveries', () => {
    it('selects the delivery organization, or the recipient oldest organization when the row has none', async () => {
      const { prisma, service } = fixture({
        due: [
          { id: 'd1', userId: 'u1', metadata: { organizationId: 'org-a' } },
          { id: 'd2', userId: 'u2', metadata: null },
          { id: 'd3', userId: 'u2', metadata: { organizationId: 7 } },
        ],
        memberships: [
          { organizationId: 'org-oldest', userId: 'u2' },
          { organizationId: 'org-newer', userId: 'u2' },
        ],
      });
      await expect(service.findOrganizationIds(NOW)).resolves.toEqual([
        'org-a',
        'org-oldest',
      ]);
      expect(prisma.lifecycleEmailDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: { in: ['scheduled', 'failed'] },
            scheduledFor: { lte: NOW },
          },
        }),
      );
      expect(prisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: { in: ['u2'] },
            isDeleted: false,
            isActive: true,
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('pages through every due delivery', async () => {
      const { prisma, service } = fixture();
      prisma.lifecycleEmailDelivery.findMany
        .mockResolvedValueOnce(
          Array.from({ length: 500 }, (_, index) => ({
            id: `d${index}`,
            userId: 'u1',
            metadata: { organizationId: 'org-a' },
          })),
        )
        .mockResolvedValueOnce([
          { id: 'z', userId: 'u1', metadata: { organizationId: 'org-b' } },
        ]);
      await expect(service.findOrganizationIds(NOW)).resolves.toEqual([
        'org-a',
        'org-b',
      ]);
      expect(prisma.lifecycleEmailDelivery.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: { id: 'd499' }, skip: 1 }),
      );
    });
  });

  describe('product signals', () => {
    it('selects organizations whose newest generation or purchase is past their checkpoint, or that have none', async () => {
      const { service } = fixture({
        checkpoints: [
          { organizationId: 'org-old', scannedThrough: HOUR_AGO },
          { organizationId: 'org-new', scannedThrough: TWO_HOURS_AGO },
        ],
        generations: [
          // Already scanned: finished before the checkpoint.
          { organizationId: 'org-old', at: TWO_HOURS_AGO },
          { organizationId: 'org-new', at: HOUR_AGO },
          { organizationId: 'org-fresh', at: HOUR_AGO },
        ],
      });
      await expect(service.findOrganizationIds(NOW)).resolves.toEqual([
        'org-fresh',
        'org-new',
      ]);
    });

    it('reads receipts against the receipt checkpoint stream', async () => {
      const { prisma, service } = fixture({
        purchases: [{ organizationId: 'org-buyer', at: HOUR_AGO }],
      });
      await expect(service.findOrganizationIds(NOW)).resolves.toEqual([
        'org-buyer',
      ]);
      expect(prisma.emailSignalCheckpoint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ stream: 'receipt' }),
        }),
      );
    });

    it('selects organizations with a message accepted in the last 14 days', async () => {
      const { prisma, service } = fixture({ messages: ['org-mailed'] });
      await expect(service.findOrganizationIds(NOW)).resolves.toEqual([
        'org-mailed',
      ]);
      expect(prisma.emailMessage.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            goal: { not: null },
            acceptedAt: {
              gte: new Date('2026-08-31T08:00:00.000Z'),
              lte: NOW,
            },
          }),
        }),
      );
    });
  });

  it('selects organizations with content in the last completed week for recaps', async () => {
    const { prisma, service } = fixture({
      recapArticles: ['org-writer'],
      recapIngredients: ['org-maker'],
    });
    await expect(service.findOrganizationIds(NOW)).resolves.toEqual([
      'org-maker',
      'org-writer',
    ]);
    expect(prisma.article.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isDeleted: false,
          generationCompletedAt: { gte: new Date('2026-09-07T00:00:00.000Z') },
        },
      }),
    );
  });

  it('selects organizations inside a free-trial notice window', async () => {
    const { findNoticeWindowOrganizationIds, service } = fixture({
      trialOrganizations: ['org-trial'],
    });
    await expect(service.findOrganizationIds(NOW)).resolves.toEqual([
      'org-trial',
    ]);
    expect(findNoticeWindowOrganizationIds).toHaveBeenCalledWith(NOW);
  });

  describe('credit alerts', () => {
    it('selects paying organizations that are exhausted or below their threshold, and no healthy one', async () => {
      const { resolve, service } = fixture({
        payingOrganizations: ['org-empty', 'org-low', 'org-fine'],
        creditBalances: [
          { organizationId: 'org-empty', balance: 20, heldAmount: 20 },
          { organizationId: 'org-low', balance: 400, heldAmount: 0 },
          { organizationId: 'org-fine', balance: 5_000, heldAmount: 100 },
        ],
      });
      await expect(service.findOrganizationIds(NOW)).resolves.toEqual([
        'org-empty',
        'org-low',
      ]);
      expect(resolve).not.toHaveBeenCalledWith('org-empty');
      expect(resolve).toHaveBeenCalledWith('org-low');
    });

    it('does not select a low balance when no threshold is known', async () => {
      const { service } = fixture({
        payingOrganizations: ['org-low'],
        creditBalances: [
          { organizationId: 'org-low', balance: 10, heldAmount: 0 },
        ],
        threshold: null,
      });
      await expect(service.findOrganizationIds(NOW)).resolves.toEqual([]);
    });
  });

  it('does not consult login activity: an inactive organization with work is selected', async () => {
    // The fixture has no session model, so reading one would throw.
    const { service } = fixture({
      due: [{ id: 'd1', userId: 'u1', metadata: { organizationId: 'org-a' } }],
    });
    await expect(service.findOrganizationIds(NOW)).resolves.toEqual(['org-a']);
  });

  it('lists an organization once however many sources select it', async () => {
    const { service } = fixture({
      messages: ['org-a'],
      recapIngredients: ['org-a'],
      trialOrganizations: ['org-a'],
    });
    await expect(service.findOrganizationIds(NOW)).resolves.toEqual(['org-a']);
  });
});
