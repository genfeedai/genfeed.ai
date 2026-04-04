import { OrganizationSettingEntity } from '@api/collections/organization-settings/entities/organization-setting.entity';

describe('OrganizationSettingEntity', () => {
  it('should set isVoiceControlEnabled', () => {
    const entity = new OrganizationSettingEntity({
      brandsLimit: 0,
      isVoiceControlEnabled: true,
      isWhitelabelEnabled: false,
      organization: {},
      seatsLimit: 0,
    });

    expect(entity).toBeDefined();
    expect(entity).toBeInstanceOf(OrganizationSettingEntity);
    expect(entity['isVoiceControlEnabled']).toBe(true);
  });
});
