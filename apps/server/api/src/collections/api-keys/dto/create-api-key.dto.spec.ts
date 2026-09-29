import { CreateApiKeyDto } from '@api/collections/api-keys/dto/create-api-key.dto';

describe('CreateApiKeyDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateApiKeyDto();
      expect(dto).toBeInstanceOf(CreateApiKeyDto);
    });
  });
});
