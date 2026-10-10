import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { UpdateOrganizationSettingDto } from '@api/collections/organization-settings/dto/update-organization-setting.dto';
import type { OrganizationOnboardingFinishedEvent } from '@api/collections/organizations/organization-events.types';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

const BILLING_CONTROLLED_SETTINGS = [
  'subscriptionTier',
  'seatsLimit',
  'brandsLimit',
] as const;

/**
 * Fields a settings PATCH may never write: onboarding-journey state is owned by
 * the server, plan limits by billing, and release preview by Genfeed (super
 * admins excepted for the last two).
 */
export function assertSettingsPatchAllowed(
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

/**
 * `isFirstLogin: false` is the classic onboarding skip (REST audit #1354).
 * Skipping still starts the free trial, so it announces the finish that grants
 * the trial credits. Any other settings write announces nothing.
 */
export function onboardingSkipEvent(
  settingsDto: UpdateOrganizationSettingDto,
  organizationId: string,
  actor: AuthenticatedUser | undefined,
): OrganizationOnboardingFinishedEvent | null {
  const userId = actor?.userId || actor?.id;
  return settingsDto.isFirstLogin === false && userId
    ? { organizationId, outcome: 'skipped', userId }
    : null;
}
