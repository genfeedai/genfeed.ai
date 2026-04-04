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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateMetadataDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
