import { UpdateAssetDto } from '@api/collections/assets/dto/update-asset.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { BadRequestException } from '@nestjs/common';

describe('UpdateAssetDto', () => {
  const pipe = new ValidationPipe();
  const metadata = { metatype: UpdateAssetDto, type: 'body' as const };

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
});
