import { CreateApiKeyDto } from '@api/collections/api-keys/dto/create-api-key.dto';

describe('CreateApiKeyDto', () => {
  it('should be defined', () => {
    expect(CreateApiKeyDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateApiKeyDto();
      expect(dto).toBeInstanceOf(CreateApiKeyDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateApiKeyDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
