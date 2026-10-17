import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { hasOrganizationBilling } from '@genfeedai/config';
import {
  isReleaseItemVisible,
  ORGANIZATION_MODULE_IDS,
  type OrganizationModuleId,
  PLATFORM_RELEASE_FLAG_KEYS,
  resolveOrganizationModulePreferences,
} from '@genfeedai/contracts/constants';
import type {
  IOrganizationAppsReport,
  IOrganizationAppsReportApp,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OrganizationAppsReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /** Which apps each organization sees, from the same rules the app shell uses. */
  async getReport(): Promise<IOrganizationAppsReport> {
    const isBilling = hasOrganizationBilling();
    const [organizations, { flags }] = await Promise.all([
      this.prisma.organization.findMany({
        orderBy: { label: 'asc' },
        select: {
          id: true,
          label: true,
          settings: {
            select: {
              isReleasePreviewEnabled: true,
              moduleOverrides: true,
              releasedItemIds: true,
              subscriptionTier: true,
            },
          },
          slug: true,
        },
        where: { isDeleted: false },
      }),
      this.platformSettings.getFeatureSettings(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      organizations: organizations.map((organization) => {
        const settings = organization.settings;
        const audience = {
          hasOrganizationBilling: isBilling,
          isReleasePreviewEnabled: settings?.isReleasePreviewEnabled === true,
          moduleOverrides: settings?.moduleOverrides ?? {},
          releasedItemIds: settings?.releasedItemIds ?? [],
        };
        const preferences = resolveOrganizationModulePreferences(
          audience,
          flags,
        );
        const apps = Object.fromEntries(
          ORGANIZATION_MODULE_IDS.map((moduleId) => [
            moduleId,
            {
              isReleased: isReleaseItemVisible(moduleId, audience, flags),
              isVisible: preferences?.[moduleId] === true,
            },
          ]),
        ) as Record<OrganizationModuleId, IOrganizationAppsReportApp>;

        return {
          apps,
          id: organization.id,
          isReleasePreviewEnabled: audience.isReleasePreviewEnabled,
          label: organization.label,
          releasedItemIds: audience.releasedItemIds,
          slug: organization.slug,
          subscriptionTier: settings?.subscriptionTier ?? null,
        };
      }),
      releaseFlags: Object.fromEntries(
        PLATFORM_RELEASE_FLAG_KEYS.map((key) => [key, flags[key] === true]),
      ),
    };
  }
}
