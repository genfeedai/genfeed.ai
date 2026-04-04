import { SettingEntity } from '@api/collections/settings/entities/setting.entity';

describe('SettingEntity', () => {
  it('should be defined', () => {
    expect(new SettingEntity({})).toBeDefined();
  });
});
