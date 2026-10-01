import { BrandFontAssetsController } from '@api/collections/brands/controllers/brand-font-assets.controller';
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandsAgentConfigController } from '@api/collections/brands/controllers/brands-agent-config.controller';
import { BrandsSetupController } from '@api/collections/brands/controllers/brands-setup.controller';
import { BrandsRelationshipsController } from '@api/collections/brands/controllers/relationships/brands-relationships.controller';
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
    ).toEqual([
      BrandOsRevisionsController,
      BrandOsScanController,
      BrandFontAssetsController,
      BrandsAgentConfigController,
      BrandsSetupController,
      BrandsController,
      BrandsRelationshipsController,
    ]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, BrandsModule),
    ).toContain(BrandsCoreModule);
  });
});
