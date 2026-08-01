import { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import type { ArgumentMetadata } from '@nestjs/common';

describe('UpdateBrandDto', () => {
  const metadata: ArgumentMetadata = {
    metatype: UpdateBrandDto,
    type: 'body',
  };
  const pipe = new ValidationPipe();

  it('should be defined', () => {
    expect(UpdateBrandDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateBrandDto();
      expect(dto).toBeInstanceOf(UpdateBrandDto);
    });

    it('accepts scalar settings and the explicit relocation identifier', async () => {
      const result = await pipe.transform(
        {
          label: 'Renamed Brand',
          organizationId: '507f191e810c19729de860ee',
        },
        metadata,
      );

      expect(result).toMatchObject({
        label: 'Renamed Brand',
        organizationId: '507f191e810c19729de860ee',
      });
    });

    it.each(['brand', 'brandId', 'organization', 'user', 'userId'])(
      'rejects the ownership relation field %s with a 400',
      async (field) => {
        await expect(
          pipe.transform(
            {
              label: 'Renamed Brand',
              [field]: '507f191e810c19729de860ee',
            },
            metadata,
          ),
        ).rejects.toMatchObject({ status: 400 });
      },
    );
  });
});
