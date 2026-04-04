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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateMetadataDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
