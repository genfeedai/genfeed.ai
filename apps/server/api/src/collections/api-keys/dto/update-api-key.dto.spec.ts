import { UpdateApiKeyDto } from '@api/collections/api-keys/dto/update-api-key.dto';

describe('UpdateApiKeyDto', () => {
  it('should be defined', () => {
    expect(UpdateApiKeyDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateApiKeyDto();
      expect(dto).toBeInstanceOf(UpdateApiKeyDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateApiKeyDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
