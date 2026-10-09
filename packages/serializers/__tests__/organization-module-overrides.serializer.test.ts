import { OrganizationSettingSerializer } from '@serializers/server/organizations/organization-settings.serializer';
import { describe, expect, it } from 'vitest';

describe('organization module preferences serialization', () => {
  it('returns persisted module preferences through the canonical settings serializer', () => {
    const result = OrganizationSettingSerializer.serialize({
      id: 'settings-1',
      moduleOverrides: { automation: true, batch: false },
      hasOrganizationBilling: true,
      hasPaidModuleSubscription: false,
      unrelatedInternalValue: 'hidden',
    }) as { data: { attributes: Record<string, unknown> } };
    expect(result.data.attributes.moduleOverrides).toEqual({
      automation: true,
      batch: false,
    });
    expect(result.data.attributes).not.toHaveProperty('unrelatedInternalValue');
    expect(result.data.attributes.hasOrganizationBilling).toBe(true);
    expect(result.data.attributes.hasPaidModuleSubscription).toBe(false);
  });
});
