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
  });
});
