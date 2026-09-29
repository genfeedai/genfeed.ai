import { UpdateSettingDto } from '@api/collections/settings/dto/update-setting.dto';

describe('UpdateSettingDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateSettingDto();
      expect(dto).toBeInstanceOf(UpdateSettingDto);
    });
  });
});
