import { UpdateAssetDto } from '@api/collections/assets/dto/update-asset.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { AssetCategory, AssetParent } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { BadRequestException } from '@nestjs/common';

describe('UpdateAssetDto', () => {
  const pipe = new ValidationPipe();
  const metadata = { metatype: UpdateAssetDto, type: 'body' as const };

  it('keeps permitted metadata and strips request-supplied query clauses', async () => {
    const data = {
      category: AssetCategory.LOGO,
      parentId: testId('brand'),
      parentType: AssetParent.BRAND,
    };
    await expect(
      pipe.transform({ ...data, where: { $or: [] } }, metadata),
    ).resolves.toEqual(data);
  });

  it.each([
    { category: 'SELECT' },
    { category: { $in: ['LOGO'] } },
    { parentType: 'UPDATE' },
    { parentType: { $ne: null } },
    { parentId: '1 OR 1=1' },
    { parentId: { $ne: null } },
    { isDeleted: { set: true } },
  ])('rejects invalid metadata before persistence: %j', async (body) => {
    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

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
