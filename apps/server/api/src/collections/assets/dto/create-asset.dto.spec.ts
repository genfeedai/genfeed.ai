import { CreateAssetDto } from '@api/collections/assets/dto/create-asset.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { AssetCategory, AssetParent } from '@genfeedai/contracts';

describe('CreateAssetDto', () => {
  it('should be defined', () => {
    expect(CreateAssetDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateAssetDto();
      expect(dto).toBeInstanceOf(CreateAssetDto);
    });
  });
});

describe('Dedicated font bypass admission', () => {
  it('rejects FONT', async () => {
    await expect(
      new ValidationPipe().transform(
        {
          ...{ parentType: AssetParent.BRAND, category: AssetCategory.LOGO },
          category: AssetCategory.FONT,
        },
        { metatype: CreateAssetDto, type: 'body' },
      ),
    ).rejects.toThrow();
  });
});
