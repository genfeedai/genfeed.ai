import { CreateMetadataDto } from '@api/collections/metadata/dto/create-metadata.dto';

describe('CreateMetadataDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateMetadataDto();
      expect(dto).toBeInstanceOf(CreateMetadataDto);
    });
  });
});
