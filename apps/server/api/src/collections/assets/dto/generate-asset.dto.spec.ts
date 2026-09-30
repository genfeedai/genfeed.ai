import { GenerateAssetDto } from '@api/collections/assets/dto/generate-asset.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { AssetCategory, AssetParent } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { BadRequestException } from '@nestjs/common';

describe('GenerateAssetDto', () => {
  const pipe = new ValidationPipe();
  const metadata = { metatype: GenerateAssetDto, type: 'body' as const };
  const validBody = {
    category: AssetCategory.LOGO,
    model: 'test-model',
    parentId: testId('brand'),
    parentType: AssetParent.BRAND,
    text: 'Create a logo about SQL',
  };

  it('accepts free text and strips unknown query-shaped properties', async () => {
    await expect(
      pipe.transform(
        {
          ...validBody,
          where: { $or: [] },
        },
        metadata,
      ),
    ).resolves.toEqual(validBody);
  });

  it.each([
    { text: { $ne: null } },
    { text: ['Create a logo'] },
    { text: 42 },
    { category: 'SELECT' },
    { category: { $in: ['LOGO'] } },
    { parentType: 'UPDATE' },
    { parentType: { $ne: null } },
    { parentId: '1 OR 1=1' },
    { parentId: { $ne: null } },
  ])('rejects invalid field shapes before generation: %j', async (invalid) => {
    await expect(
      pipe.transform({ ...validBody, ...invalid }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

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
