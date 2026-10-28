import {
  classifyOwnerEmail,
  readDraftsStatus,
  readPrefillMarker,
  summarizeOnboardingFunnel,
} from '@api/endpoints/admin/onboarding-funnel/onboarding-funnel.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LinkCategory } from '@genfeedai/contracts';
import type {
  IOnboardingFunnelOrganization,
  IOnboardingFunnelReport,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

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
        id: true,
        onboardingCompleted: true,
        user: { select: { email: true } },
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
          brandScanned: markers.some(
            (marker) =>
              marker.status === 'completed' && marker.hasScrapedWebsite,
          ),
          completed: row.onboardingCompleted,
          draftsReady: draftsStatus === 'ready' || draftsStatus === 'partial',
          draftsStarted: row.contentRuns.length > 0,
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
