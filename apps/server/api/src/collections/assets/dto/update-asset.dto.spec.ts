import { UpdateAssetDto } from '@api/collections/assets/dto/update-asset.dto';

describe('UpdateAssetDto', () => {
  it('should be defined', () => {
    expect(UpdateAssetDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateAssetDto();
      expect(dto).toBeInstanceOf(UpdateAssetDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateAssetDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
