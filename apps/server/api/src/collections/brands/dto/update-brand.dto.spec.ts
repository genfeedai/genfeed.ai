import { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import type { ArgumentMetadata } from '@nestjs/common';

describe('UpdateBrandDto', () => {
  const metadata: ArgumentMetadata = {
    metatype: UpdateBrandDto,
    type: 'body',
  };
  const pipe = new ValidationPipe();

  describe('validation', () => {
    // #5295: PATCH /brands/:id {"isDeleted": true} used to skip
    // BrandsService.remove()'s last-brand guard and member reassignment.
    // Soft delete must only go through remove() (DELETE /brands/:id).

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
