import { UpdateSettingDto } from '@api/collections/settings/dto/update-setting.dto';

describe('UpdateSettingDto', () => {
  it('should be defined', () => {
    expect(UpdateSettingDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateSettingDto();
      expect(dto).toBeInstanceOf(UpdateSettingDto);
    });
  });
});
