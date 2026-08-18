import { GenerateAssetDto } from '@api/collections/assets/dto/generate-asset.dto';

describe('GenerateAssetDto', () => {
  it('should be defined', () => {
    expect(GenerateAssetDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new GenerateAssetDto();
      expect(dto).toBeInstanceOf(GenerateAssetDto);
    });
  });
});
