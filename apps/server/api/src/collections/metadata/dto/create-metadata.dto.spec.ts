import { CreateMetadataDto } from '@api/collections/metadata/dto/create-metadata.dto';

describe('CreateMetadataDto', () => {
  it('should be defined', () => {
    expect(CreateMetadataDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateMetadataDto();
      expect(dto).toBeInstanceOf(CreateMetadataDto);
    });
  });
});
