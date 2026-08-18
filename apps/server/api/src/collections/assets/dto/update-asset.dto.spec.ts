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
  });
});
