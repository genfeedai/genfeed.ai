import { OrganizationSettingSerializer } from '@serializers/server/organizations/organization-settings.serializer';
import { describe, expect, it } from 'vitest';

type SerializedSettings = { data: { attributes: Record<string, unknown> } };

describe('organization rail defaults serialization', () => {
  it('returns the default rail order and home app', () => {
    const result = OrganizationSettingSerializer.serialize({
      defaultHomeAppId: 'agent',
      defaultRailOrder: ['analytics', 'agent'],
      id: 'settings-1',
    }) as SerializedSettings;

    expect(result.data.attributes.defaultRailOrder).toEqual([
      'analytics',
      'agent',
    ]);
    expect(result.data.attributes.defaultHomeAppId).toBe('agent');
  });

  it('keeps a cleared home app as null so the client can tell it from unset', () => {
    const result = OrganizationSettingSerializer.serialize({
      defaultHomeAppId: null,
      defaultRailOrder: [],
      id: 'settings-1',
    }) as SerializedSettings;

    expect(result.data.attributes.defaultHomeAppId).toBeNull();
    expect(result.data.attributes.defaultRailOrder).toEqual([]);
  });
});
