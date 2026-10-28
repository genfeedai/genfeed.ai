import {
  classifyOwnerEmail,
  readDraftsStatus,
  readPrefillMarker,
  summarizeOnboardingFunnel,
} from '@api/endpoints/admin/onboarding-funnel/onboarding-funnel.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LinkCategory, TargetExecutionState } from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types/contracts';
import type {
  IOnboardingFunnelOrganization,
  IOnboardingFunnelReport,
} from '@genfeedai/contracts/interfaces';
import { CredentialPlatform } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

/** Advertising and search connections cannot publish a post. */
const NON_PUBLISHING_PLATFORMS = [
  CredentialPlatform.GOOGLE_ADS,
  CredentialPlatform.X_ADS,
  CredentialPlatform.GOOGLE_SEARCH_CONSOLE,
];

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 30;

@Injectable()
export class OnboardingFunnelService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * How organizations created in the window moved through onboarding. Reads
   * through each organization, so brand links and onboarding runs stay scoped
   * to the organization that owns them. Internal organizations are not
   * excluded: filter the returned ids against the internal list.
   */
  async getReport(
    windowDays = DEFAULT_WINDOW_DAYS,
  ): Promise<IOnboardingFunnelReport> {
    const since = new Date(Date.now() - windowDays * DAY_MS);
    const rows = await this.prisma.organization.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        brands: {
          select: {
            agentConfig: true,
            links: {
              select: { category: true },
              where: { isDeleted: false },
            },
          },
          where: { isDeleted: false },
        },
        contentRuns: {
          orderBy: { createdAt: 'desc' },
          select: { config: true },
          take: 1,
          where: {
            config: { path: ['surface'], equals: 'onboarding' },
            isDeleted: false,
          },
        },
        createdAt: true,
        credentials: {
          select: { id: true },
          take: 1,
          where: {
            isConnected: true,
            isDeleted: false,
            platform: { notIn: NON_PUBLISHING_PLATFORMS },
          },
        },
        id: true,
        onboardingCompleted: true,
        posts: {
          select: { id: true },
          take: 1,
          where: {
            isDeleted: false,
            ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
          },
        },
        user: { select: { email: true, isOnboardingCompleted: true } },
      },
      where: { createdAt: { gte: since }, isDeleted: false },
    });

    const organizations = rows.map((row): IOnboardingFunnelOrganization => {
      const markers = row.brands.map((brand) =>
        readPrefillMarker(brand.agentConfig),
      );
      const draftsStatus = readDraftsStatus(row.contentRuns[0]?.config);
      return {
        createdAt: row.createdAt.toISOString(),
        draftsStatus,
        emailClass: classifyOwnerEmail(row.user.email),
        id: row.id,
        scanStatus:
          markers.find((marker) => marker.status !== null)?.status ?? null,
        steps: {
          accountConnected: row.credentials.length > 0,
          brandScanned: markers.some(
            (marker) =>
              marker.status === 'completed' && marker.hasScrapedWebsite,
          ),
          // The classic wizard only ever set the owner's flag; the
          // organization flag is the agent-first path's.
          completed: row.onboardingCompleted || row.user.isOnboardingCompleted,
          draftsReady: draftsStatus === 'ready' || draftsStatus === 'partial',
          draftsStarted: row.contentRuns.length > 0,
          published: row.posts.length > 0,
          websiteLink: row.brands.some((brand) =>
            brand.links.some((link) => link.category === LinkCategory.WEBSITE),
          ),
        },
      };
    });

    return {
      ...summarizeOnboardingFunnel(organizations),
      generatedAt: new Date().toISOString(),
      organizations,
      since: since.toISOString(),
      windowDays,
    };
  }
}
