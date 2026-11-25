import type { UpdateOrganizationSettingDto } from '@api/collections/organization-settings/dto/update-organization-setting.dto';
import {
  PUBLISHING_QUOTA_KEYS,
  type PublishingQuotaKey,
  type PublishingQuotaTier,
  resolvePublishingQuotaCeiling,
} from '@genfeedai/contracts/constants';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

/**
 * Plan-controlled settings. Stripe webhooks and billing services write them
 * directly; over HTTP only platform superadmins (Admin app, self-hosted local
 * identity) may change them, so an org owner cannot self-upgrade.
 */
const BILLING_CONTROLLED_SETTINGS = [
  'subscriptionTier',
  'seatsLimit',
  'brandsLimit',
] as const;

/**
 * Refuses settings that the server, billing or Genfeed own before an
 * organization settings patch is applied.
 */
export function assertOrganizationSettingsPatchAllowed(
  settingsDto: UpdateOrganizationSettingDto,
  isSuperAdmin: boolean,
): void {
  if (
    Object.hasOwn(settingsDto, 'onboardingJourneyMissions') ||
    Object.hasOwn(settingsDto, 'onboardingJourneyCompletedAt')
  ) {
    throw new BadRequestException(
      'Onboarding journey state is managed by the server',
    );
  }
  if (
    !isSuperAdmin &&
    BILLING_CONTROLLED_SETTINGS.some((field) =>
      Object.hasOwn(settingsDto, field),
    )
  ) {
    throw new BadRequestException(
      'Plan limits and subscription tier are managed by billing',
    );
  }
  if (
    !isSuperAdmin &&
    (Object.hasOwn(settingsDto, 'isReleasePreviewEnabled') ||
      Object.hasOwn(settingsDto, 'releasedItemIds'))
  ) {
    throw new ForbiddenException('Release access is managed by Genfeed');
  }
}

/** True when a settings patch sets any daily publishing cap. */
export function patchesPublishingQuota(
  settingsDto: UpdateOrganizationSettingDto,
): boolean {
  return PUBLISHING_QUOTA_KEYS.some((key) => Object.hasOwn(settingsDto, key));
}

/**
 * Daily publishing caps follow what the organization has paid: they are locked
 * until its first payment, and then stop at the tier's ceiling. Without
 * organization billing the owner's caps stand. Platform superadmins are exempt.
 */
export function assertPublishingQuotaPatchAllowed(
  settingsDto: UpdateOrganizationSettingDto,
  tier: PublishingQuotaTier,
  isSuperAdmin: boolean,
): void {
  if (isSuperAdmin || tier === 'unmetered') return;
  if (tier === 'trial') {
    throw new BadRequestException(
      'Daily publishing caps unlock with your first payment',
    );
  }
  for (const key of PUBLISHING_QUOTA_KEYS) {
    const value = settingsDto[key as PublishingQuotaKey];
    if (value === undefined) continue;
    const ceiling = resolvePublishingQuotaCeiling(tier, key);
    if (value < 1 || value > ceiling) {
      throw new BadRequestException(
        `The daily cap must be between 1 and ${ceiling} on your ${tier === 'plan' ? 'plan' : 'credits'}`,
      );
    }
  }
}
