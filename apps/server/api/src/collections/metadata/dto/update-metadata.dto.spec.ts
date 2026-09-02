import { UpdateMetadataDto } from '@api/collections/metadata/dto/update-metadata.dto';

describe('UpdateMetadataDto', () => {
  it('should be defined', () => {
    expect(UpdateMetadataDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateMetadataDto();
      expect(dto).toBeInstanceOf(UpdateMetadataDto);
    });
  });
});
