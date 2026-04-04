import { CreateSettingDto } from '@api/collections/settings/dto/create-setting.dto';

describe('CreateSettingDto', () => {
  it('should be defined', () => {
    expect(CreateSettingDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateSettingDto();
      expect(dto).toBeInstanceOf(CreateSettingDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateSettingDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
