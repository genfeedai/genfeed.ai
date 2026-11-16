import { OnboardingDraftsReviewService } from '@api/endpoints/admin/onboarding-funnel/onboarding-drafts-review.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

describe('OnboardingDraftsReviewService', () => {
  const organizationFindMany = vi.fn();
  const feedbackFindMany = vi.fn();
  let service: OnboardingDraftsReviewService;

  beforeEach(async () => {
    organizationFindMany.mockReset();
    feedbackFindMany.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        OnboardingDraftsReviewService,
        {
          provide: PrismaService,
          useValue: {
            brandedGenerationFeedback: { findMany: feedbackFindMany },
            organization: { findMany: organizationFindMany },
          },
        },
      ],
    }).compile();
    service = module.get(OnboardingDraftsReviewService);
  });

  it('joins each saved post to its verdict and never returns the owner email', async () => {
    organizationFindMany.mockResolvedValue([
      {
        brands: [{ label: 'Ember & Clay' }],
        contentRuns: [
          {
            config: {
              result: {
                drafts: [
                  { platform: 'twitter', receiptId: 'r1', text: 'Kept post' },
                  { platform: 'linkedin', receiptId: 'r2', text: 'Rejected' },
                  { platform: 'tiktok', receiptId: 'r3', text: 'Untouched' },
                ],
                imageUrl: 'https://cdn.example.com/a.png',
                status: 'ready',
              },
            },
            createdAt: new Date('2026-11-12T10:00:00.000Z'),
          },
        ],
        id: 'org_1',
        user: { email: 'maker@gmail.com' },
      },
    ]);
    feedbackFindMany.mockResolvedValue([
      { rating: 'up', reasons: [], receiptId: 'r1' },
      { rating: 'down', reasons: ['too_long'], receiptId: 'r2' },
    ]);

    const review = await service.getReview(7, 20);

    expect(review.windowDays).toBe(7);
    expect(review.runs).toEqual([
      {
        brandName: 'Ember & Clay',
        createdAt: '2026-11-12T10:00:00.000Z',
        drafts: [
          {
            platform: 'twitter',
            reasons: [],
            text: 'Kept post',
            verdict: 'up',
          },
          {
            platform: 'linkedin',
            reasons: ['too_long'],
            text: 'Rejected',
            verdict: 'down',
          },
          {
            platform: 'tiktok',
            reasons: [],
            text: 'Untouched',
            verdict: null,
          },
        ],
        draftsStatus: 'ready',
        emailClass: 'personal',
        hasMasterImage: true,
        organizationId: 'org_1',
      },
    ]);
    expect(JSON.stringify(review)).not.toContain('maker@gmail.com');
  });

  it('reads the ratings of the owning organization only', async () => {
    organizationFindMany.mockResolvedValue([
      {
        brands: [],
        contentRuns: [
          {
            config: {
              result: {
                drafts: [{ platform: 'twitter', receiptId: 'r1', text: 'A' }],
              },
            },
            createdAt: new Date('2026-11-12T10:00:00.000Z'),
          },
        ],
        id: 'org_1',
        user: { email: 'a@acme.co' },
      },
    ]);
    feedbackFindMany.mockResolvedValue([]);

    await service.getReview();

    expect(feedbackFindMany.mock.calls[0][0].where).toEqual({
      isDeleted: false,
      organizationId: 'org_1',
      receiptId: { in: ['r1'] },
    });
  });

  it('returns no runs when no organization has onboarded in the window', async () => {
    organizationFindMany.mockResolvedValue([]);

    const review = await service.getReview(30, 5);

    expect(review.runs).toEqual([]);
    expect(feedbackFindMany).not.toHaveBeenCalled();
  });
});
