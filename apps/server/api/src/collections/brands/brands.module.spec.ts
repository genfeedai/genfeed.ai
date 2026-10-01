import 'reflect-metadata';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { BrandOsRevisionsController } from '@api/collections/brands/controllers/brand-os-revisions.controller';
import { BrandOsScanController } from '@api/collections/brands/controllers/brand-os-scan.controller';
import { MODULE_METADATA } from '@nestjs/common/constants';

describe('BrandsModule registration', () => {
  it('registers additive scan routes next to revisions and imports persistence core', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, BrandsModule),
    ).toEqual(
      expect.arrayContaining([
        BrandOsScanController,
        BrandOsRevisionsController,
      ]),
    );
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, BrandsModule),
    ).toContain(BrandsCoreModule);
  });
});
