import { CreateAssetDto } from '@api/collections/assets/dto/create-asset.dto';

describe('CreateAssetDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateAssetDto();
      expect(dto).toBeInstanceOf(CreateAssetDto);
    });
  });
});
