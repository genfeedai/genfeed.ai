import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { OrganizationPaidAccessService } from '@api/common/subscriptions/organization-paid-access.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { hasOrganizationBilling } from '@genfeedai/config';
import {
  isOrganizationModuleSwitchedOff,
  isReleaseItemVisible,
  ORGANIZATION_MODULES,
  type OrganizationModuleAccess,
  type OrganizationModuleAccessInput,
  type ReleaseItemId,
  resolveOrganizationModuleAccess,
} from '@genfeedai/contracts/constants';
import type { IPlatformFeatureSettingsState } from '@genfeedai/contracts/interfaces';
import { Traced } from '@libs/tracing/traced';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * Shared admission for HTTP and execution adapters; no balance or key bypass.
 * A superadmin passes only the platform kill switch.
 */
@Traced()
@Injectable()
export class OrganizationModuleAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paidAccess: OrganizationPaidAccessService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /** Optional background fills must not turn a saved-data read into new work. */
  async canStartWork(
    organizationId: string,
    moduleId: OrganizationModuleAccessInput['moduleId'],
  ): Promise<boolean> {
    try {
      await this.assertAccess(organizationId, moduleId);
      return true;
    } catch (error: unknown) {
      if (error instanceof HttpException) return false;
      throw error;
    }
  }

  /**
   * Whether `itemId` is released to the organization: self-hosted, a cloud
   * organization on release preview, or released in Admin → Flags.
   */
  async isReleased(
    organizationId: string,
    itemId: ReleaseItemId,
  ): Promise<boolean> {
    if (!hasOrganizationBilling()) return true;
    const [settings, { flags }] = await Promise.all([
      this.prisma.organizationSetting.findUnique({
        where: { organizationId },
        select: { isReleasePreviewEnabled: true, releasedItemIds: true },
      }),
      this.platformSettings.getFeatureSettings(),
    ]);
    return isReleaseItemVisible(
      itemId,
      {
        hasOrganizationBilling: true,
        isReleasePreviewEnabled: settings?.isReleasePreviewEnabled === true,
        releasedItemIds: settings?.releasedItemIds,
      },
      flags,
    );
  }

  /**
   * Admission for one module operation. A module whose platform kill switch
   * is off answers 404 for every operation, as its app route does; only a
   * superadmin passes, so an operator can inspect it. Writes then also need
   * the module's release and, on cloud, its subscription; superadmins get no
   * bypass there.
   */
  async assertAccess(
    organizationId: string,
    moduleId: OrganizationModuleAccessInput['moduleId'],
    operation: OrganizationModuleAccessInput['operation'] = 'write',
    { isSuperAdmin = false }: { isSuperAdmin?: boolean } = {},
  ): Promise<void> {
    const platformState = Object.hasOwn(ORGANIZATION_MODULES, moduleId)
      ? await this.readPlatformState(moduleId)
      : null;
    if (
      platformState &&
      !isSuperAdmin &&
      isOrganizationModuleSwitchedOff(moduleId, platformState.settings.flags)
    ) {
      throw new NotFoundException('Route');
    }
    // Read/export callers still perform their normal authentication and tenant checks.
    if (operation !== 'write') return;
    if (!organizationId || !platformState) this.reject(moduleId, 'unavailable');
    let access: OrganizationModuleAccess;
    try {
      const organization = await this.prisma.organization.findFirst({
        where: { id: organizationId, isDeleted: false },
        select: { id: true },
      });
      if (!organization) this.reject(moduleId, 'unavailable');
      const settings = await this.prisma.organizationSetting.findUnique({
        where: { organizationId },
        select: { isReleasePreviewEnabled: true, releasedItemIds: true },
      });
      const isBilling = hasOrganizationBilling();
      // Unread releases must not pass for unreleased: retry instead.
      if (isBilling && !platformState.isResolved)
        this.reject(moduleId, 'unavailable');
      const { flags } = platformState.settings;
      const input: OrganizationModuleAccessInput = {
        moduleId,
        operation,
        hasOrganizationBilling: isBilling,
        hasPaidSubscription: null,
        isReleased: isReleaseItemVisible(
          moduleId,
          {
            hasOrganizationBilling: isBilling,
            isReleasePreviewEnabled: settings?.isReleasePreviewEnabled === true,
            releasedItemIds: settings?.releasedItemIds,
          },
          flags,
        ),
        isSettingsLoaded: Boolean(settings),
      };
      access = resolveOrganizationModuleAccess(input);
      if (
        !access.isAllowed &&
        access.reason === 'unavailable' &&
        settings &&
        ORGANIZATION_MODULES[moduleId].requiresSubscription &&
        isBilling
      ) {
        const isSubscriptionGated =
          await this.paidAccess.isSubscriptionGatedFresh(organizationId);
        access = resolveOrganizationModuleAccess({
          ...input,
          hasPaidSubscription: !isSubscriptionGated,
        });
      }
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.reject(moduleId, 'unavailable');
    }
    if (!access.isAllowed) this.reject(moduleId, access.reason);
  }

  private async readPlatformState(
    moduleId: OrganizationModuleAccessInput['moduleId'],
  ): Promise<IPlatformFeatureSettingsState> {
    try {
      return await this.platformSettings.getFeatureSettingsState();
    } catch {
      this.reject(moduleId, 'unavailable');
    }
  }

  private reject(
    moduleId: OrganizationModuleAccessInput['moduleId'],
    reason: Exclude<OrganizationModuleAccess['reason'], null>,
  ): never {
    const label = Object.hasOwn(ORGANIZATION_MODULES, moduleId)
      ? ORGANIZATION_MODULES[moduleId].label
      : 'Module';
    throw new HttpException(
      {
        code:
          reason === 'subscription-required'
            ? 'ORGANIZATION_MODULE_SUBSCRIPTION_REQUIRED'
            : reason === 'unreleased'
              ? 'ORGANIZATION_MODULE_UNRELEASED'
              : 'ORGANIZATION_MODULE_UNAVAILABLE',
        moduleId,
        title:
          reason === 'subscription-required'
            ? 'Active subscription required'
            : reason === 'unreleased'
              ? 'Module not released'
              : 'Module access unavailable',
        detail:
          reason === 'subscription-required'
            ? `${label} requires an active paid subscription. Existing data remains readable and exportable.`
            : reason === 'unreleased'
              ? `${label} is not released yet. Existing data remains readable and exportable.`
              : 'Module access could not be verified. Try again before starting new work.',
      },
      reason === 'unavailable'
        ? HttpStatus.SERVICE_UNAVAILABLE
        : HttpStatus.FORBIDDEN,
    );
  }
}
