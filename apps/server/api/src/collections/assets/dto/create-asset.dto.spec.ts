import { CreateAssetDto } from '@api/collections/assets/dto/create-asset.dto';

describe('CreateAssetDto', () => {
  it('should be defined', () => {
    expect(CreateAssetDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateAssetDto();
      expect(dto).toBeInstanceOf(CreateAssetDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateAssetDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
