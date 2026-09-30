import { CreateBrandDto } from '@api/collections/brands/dto/create-brand.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import type { ArgumentMetadata } from '@nestjs/common';

describe('CreateBrandDto', () => {
  const metadata: ArgumentMetadata = {
    metatype: CreateBrandDto,
    type: 'body',
  };
  const pipe = new ValidationPipe();
  const brand = {
    backgroundColor: '#000000',
    fontFamily: 'montserrat-black',
    label: 'Acme',
    primaryColor: '#000000',
    secondaryColor: '#FFFFFF',
  };

  it('should be defined', () => {
    expect(CreateBrandDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateBrandDto();
      expect(dto).toBeInstanceOf(CreateBrandDto);
    });

    it('accepts a valid handle', async () => {
      await expect(
        pipe.transform({ ...brand, slug: 'acme-labs' }, metadata),
      ).resolves.toMatchObject({ slug: 'acme-labs' });
    });

    it('lets the server derive the handle when none is sent', async () => {
      await expect(pipe.transform(brand, metadata)).resolves.toMatchObject({
        label: 'Acme',
      });
    });

    it.each(['a', 'Acme', 'acme_labs', 'acme--labs', 'a'.repeat(49)])(
      'rejects the handle %j, as an update would',
      async (slug) => {
        await expect(
          pipe.transform({ ...brand, slug }, metadata),
        ).rejects.toMatchObject({ status: 400 });
      },
    );
  });
});
