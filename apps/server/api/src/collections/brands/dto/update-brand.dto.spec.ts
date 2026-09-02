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
          organizationId: 'cmorganization000000000000001',
        },
        metadata,
      );

      expect(result).toMatchObject({
        label: 'Renamed Brand',
        organizationId: 'cmorganization000000000000001',
      });
    });

    it.each(['brand', 'brandId', 'organization', 'user', 'userId'])(
      'rejects the ownership relation field %s with a 400',
      async (field) => {
        await expect(
          pipe.transform(
            {
              label: 'Renamed Brand',
              [field]: '000000000000000000000001',
            },
            metadata,
          ),
        ).rejects.toMatchObject({ status: 400 });
      },
    );

    it.each(
      ['brand', 'brandId', 'organization', 'user', 'userId'].flatMap((field) =>
        ['', null].map((value) => ({ field, value })),
      ),
    )(
      'rejects the supplied blank ownership alias $field',
      async ({ field, value }) => {
        await expect(
          pipe.transform(
            {
              label: 'Renamed Brand',
              [field]: value,
            },
            metadata,
          ),
        ).rejects.toMatchObject({ status: 400 });
      },
    );

    it('does not require unknown extra fields and strips undeclared relocationAck', async () => {
      const result = await pipe.transform(
        {
          label: 'Renamed Brand',
          relocationAck: 'legacy-token',
        },
        metadata,
      );

      expect(result).toMatchObject({ label: 'Renamed Brand' });
      expect(result).not.toHaveProperty('relocationAck');
    });
  });
});
