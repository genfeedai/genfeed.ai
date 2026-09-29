import { UpdateApiKeyDto } from '@api/collections/api-keys/dto/update-api-key.dto';

describe('UpdateApiKeyDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateApiKeyDto();
      expect(dto).toBeInstanceOf(UpdateApiKeyDto);
    });
  });
});
