import type { UpdateOrganizationSettingDto } from '@api/collections/organization-settings/dto/update-organization-setting.dto';
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
  if (!isSuperAdmin && Object.hasOwn(settingsDto, 'isReleasePreviewEnabled')) {
    throw new ForbiddenException('Release preview is managed by Genfeed');
  }
}
