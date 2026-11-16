import {
  readDraftsStatus,
  readOnboardingDrafts,
} from '@api/endpoints/admin/onboarding-funnel/onboarding-funnel.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { classifyEmail } from '@api/shared/utils/email-class/email-class.util';
import type {
  IOnboardingDraftsReview,
  IOnboardingDraftsReviewRun,
} from '@genfeedai/contracts/interfaces';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_LIMIT = 20;

@Traced()
@Injectable()
export class OnboardingDraftsReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The newest first-run campaign of each recent organization, with the
   * member's "I'd post this" or "Not for me" on every post. Read-only. Reads
   * through each organization, so runs and ratings stay scoped to the
   * organization that owns them. Internal organizations are not excluded.
   */
  async getReview(
    windowDays = DEFAULT_WINDOW_DAYS,
    limit = DEFAULT_LIMIT,
  ): Promise<IOnboardingDraftsReview> {
    const since = new Date(Date.now() - windowDays * DAY_MS);
    const onboardingRun = {
      config: { path: ['surface'], equals: 'onboarding' },
      isDeleted: false,
    };
    const rows = await this.prisma.organization.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: {
        brands: {
          orderBy: { createdAt: 'asc' },
          select: { label: true },
          take: 1,
          where: { isDeleted: false },
        },
        contentRuns: {
          orderBy: { createdAt: 'desc' },
          select: { config: true, createdAt: true },
          take: 1,
          where: onboardingRun,
        },
        id: true,
        user: { select: { email: true } },
      },
      take: limit,
      where: {
        contentRuns: { some: onboardingRun },
        createdAt: { gte: since },
        isDeleted: false,
      },
    });

    const runs = await Promise.all(
      rows.map(async (row): Promise<IOnboardingDraftsReviewRun> => {
        const run = row.contentRuns[0];
        const { drafts, hasMasterImage } = readOnboardingDrafts(run?.config);
        const feedback = drafts.length
          ? await this.prisma.brandedGenerationFeedback.findMany({
              select: { rating: true, reasons: true, receiptId: true },
              // One verdict per draft, from the single user of a new organization.
              take: drafts.length * 4,
              where: {
                isDeleted: false,
                organizationId: row.id,
                receiptId: { in: drafts.map((draft) => draft.receiptId) },
              },
            })
          : [];
        return {
          brandName: row.brands[0]?.label ?? null,
          createdAt: (run?.createdAt ?? new Date(0)).toISOString(),
          drafts: drafts.map((draft) => {
            const rating = feedback.find(
              (entry) => entry.receiptId === draft.receiptId,
            );
            return {
              platform: draft.platform,
              reasons: rating?.reasons ?? [],
              text: draft.text,
              verdict:
                rating?.rating === 'up' || rating?.rating === 'down'
                  ? rating.rating
                  : null,
            };
          }),
          draftsStatus: readDraftsStatus(run?.config),
          emailClass: classifyEmail(row.user.email),
          hasMasterImage,
          organizationId: row.id,
        };
      }),
    );

    return {
      generatedAt: new Date().toISOString(),
      runs,
      since: since.toISOString(),
      windowDays,
    };
  }
}
