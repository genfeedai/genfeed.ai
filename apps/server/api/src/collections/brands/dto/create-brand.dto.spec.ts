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

  describe('validation', () => {
    it('lets the server derive the handle when none is sent', async () => {
      await expect(pipe.transform(brand, metadata)).resolves.toMatchObject({
        label: 'Acme',
      });
    });
  });
});
