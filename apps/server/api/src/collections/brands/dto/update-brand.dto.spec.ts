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
    // #10187: end card, colour grade and watermark change through a Brand OS
    // revision, so a brand update that carries one is refused, not stripped.
    it.each([
      ['watermarkText', 'acme.coffee'],
      ['watermarkLogoId', 'cmasset0000000000000000001'],
      ['watermarkOpacity', 0.5],
      ['watermarkPosition', 'top-left'],
      ['watermarkLightLogoId', null],
      ['watermarkLiveLogoId', null],
      ['watermarkSizeRatio', 0.1],
      ['watermarkInsetXRatio', 0.05],
      ['watermarkInsetYRatio', 0.05],
      ['endCardAssetId', 'cmasset0000000000000000001'],
      ['endCardDurationSeconds', 3],
      ['isEndCardEnabled', true],
      ['isLutEnabled', true],
    ])(
      'rejects %s so finishing changes go through a revision',
      async (field, value) => {
        await expect(
          pipe.transform({ [field]: value, label: 'Renamed Brand' }, metadata),
        ).rejects.toMatchObject({ status: 400 });
      },
    );

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

    // #5295: PATCH /brands/:id {"isDeleted": true} used to skip
    // BrandsService.remove()'s last-brand guard and member reassignment.
    // Soft delete must only go through remove() (DELETE /brands/:id).
    it.each([true, false])(
      'rejects isDeleted=%s so soft delete cannot go through a brand update',
      async (value) => {
        await expect(
          pipe.transform(
            { isDeleted: value, label: 'Renamed Brand' },
            metadata,
          ),
        ).rejects.toMatchObject({ status: 400 });
      },
    );

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
