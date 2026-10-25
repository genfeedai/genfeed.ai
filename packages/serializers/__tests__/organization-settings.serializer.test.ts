import { SubscriptionTier } from '@genfeedai/contracts';
import { OrganizationSettingSerializer } from '@serializers/server/organizations/organization-settings.serializer';
import { describe, expect, it } from 'vitest';

const settingsFixture = {
  hasOrganizationBilling: true,
  hasPaidModuleSubscription: false,
  id: 'organization-settings-fixture',
  isDeleted: false,
  organizationId: 'organization-fixture',
  seatsLimit: 1,
  timezone: 'UTC',
};

describe('OrganizationSettingSerializer subscription tier', () => {
  it.each([
    SubscriptionTier.FREE,
    SubscriptionTier.SCALE,
    SubscriptionTier.ENTERPRISE,
    'future-tier',
    'FREE',
    '',
    null,
  ])('retains raw tier %j and neighboring settings', (subscriptionTier) => {
    const settings = { ...settingsFixture, subscriptionTier };
    const before = structuredClone(settings);

    expect(OrganizationSettingSerializer.serialize(settings)).toEqual({
      data: {
        attributes: {
          hasOrganizationBilling: true,
          hasPaidModuleSubscription: false,
          isDeleted: false,
          seatsLimit: 1,
          subscriptionTier,
          timezone: 'UTC',
        },
        id: 'organization-settings-fixture',
        type: 'organization-setting',
      },
    });
    expect(settings).toEqual(before);
  });

  it('does not invent a tier when the source settings have none', () => {
    expect(OrganizationSettingSerializer.serialize(settingsFixture)).toEqual({
      data: {
        attributes: {
          hasOrganizationBilling: true,
          hasPaidModuleSubscription: false,
          isDeleted: false,
          seatsLimit: 1,
          timezone: 'UTC',
        },
        id: 'organization-settings-fixture',
        type: 'organization-setting',
      },
    });
  });
});
