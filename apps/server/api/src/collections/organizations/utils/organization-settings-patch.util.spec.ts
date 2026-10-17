import { UpdateOrganizationSettingDto } from '@api/collections/organization-settings/dto/update-organization-setting.dto';
import { assertOrganizationSettingsPatchAllowed } from '@api/collections/organizations/utils/organization-settings-patch.util';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

function dto(fields: Record<string, unknown>): UpdateOrganizationSettingDto {
  return Object.assign(new UpdateOrganizationSettingDto(), fields);
}

describe('assertOrganizationSettingsPatchAllowed', () => {
  it('refuses server-managed onboarding journey state for everyone', () => {
    expect(() =>
      assertOrganizationSettingsPatchAllowed(
        dto({ onboardingJourneyCompletedAt: null }),
        true,
      ),
    ).toThrow(BadRequestException);
  });

  it('lets only superadmins write billing-controlled settings', () => {
    expect(() =>
      assertOrganizationSettingsPatchAllowed(dto({ seatsLimit: 5 }), false),
    ).toThrow(BadRequestException);
    expect(() =>
      assertOrganizationSettingsPatchAllowed(dto({ seatsLimit: 5 }), true),
    ).not.toThrow();
  });

  it('lets only superadmins change release preview', () => {
    expect(() =>
      assertOrganizationSettingsPatchAllowed(
        dto({ isReleasePreviewEnabled: true }),
        false,
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertOrganizationSettingsPatchAllowed(
        dto({ isReleasePreviewEnabled: true }),
        true,
      ),
    ).not.toThrow();
  });

  it('lets only superadmins grant release items to an organization', () => {
    expect(() =>
      assertOrganizationSettingsPatchAllowed(
        dto({ releasedItemIds: ['turbo'] }),
        false,
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertOrganizationSettingsPatchAllowed(
        dto({ releasedItemIds: ['turbo'] }),
        true,
      ),
    ).not.toThrow();
  });

  it('allows ordinary settings for owners and admins', () => {
    expect(() =>
      assertOrganizationSettingsPatchAllowed(
        dto({ isFirstLogin: false }),
        false,
      ),
    ).not.toThrow();
  });
});
