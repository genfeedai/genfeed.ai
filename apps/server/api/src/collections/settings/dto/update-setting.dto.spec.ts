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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateSettingDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
