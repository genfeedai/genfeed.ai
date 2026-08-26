import { BrandsModule } from '@api/collections/brands/brands.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { PublicBrandOsController } from '@api/endpoints/public/controllers/brand-os/public.brand-os.controller';
import { PublicModule } from '@api/endpoints/public/public.module';
import { MODULE_METADATA } from '@nestjs/common/constants';

describe('PublicModule', () => {
  it('should be defined', () => {
    expect(PublicModule).toBeDefined();
  });

  it('registers Brand OS on the leaf brand module rather than the fat collection graph', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      PublicModule,
    ) as unknown[];
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      PublicModule,
    ) as unknown[];

    expect(controllers).toContain(PublicBrandOsController);
    expect(imports).toContain(BrandsCoreModule);
    expect(imports).not.toContain(BrandsModule);
  });
});
